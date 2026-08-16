import express from 'express';
import { z } from 'zod';
import { supabase } from './supabase.js';
import { AppError } from './errors.js';
import { requireAuth, loadRole, allowRoles } from './middleware/auth.js';

const router = express.Router();
const protectedAdmin = [requireAuth, loadRole, allowRoles('admin')];
const statusValues = ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'];
const roleValues = ['patient', 'dentist', 'staff', 'admin'];
const activeSlotStatuses = ['pending', 'confirmed', 'rescheduled'];
const isMissingUpgrade = (error) => ['42P01', '42703', 'PGRST205'].includes(error?.code);

const appointmentInput = z.object({
  patientName: z.string().trim().min(2).max(100).optional(),
  patientPhone: z.string().trim().min(7).max(30).optional(),
  patientEmail: z.string().email().nullable().optional(),
  dentistId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  startsAt: z.string().datetime().optional(),
  status: z.enum(statusValues).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  adminNotes: z.string().trim().max(2000).nullable().optional()
});

function pageParams(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const perPage = Math.min(100, Math.max(10, Number.parseInt(query.perPage, 10) || 20));
  return { page, perPage, start: (page - 1) * perPage };
}

async function writeAudit(actorId, action, entityType, entityId, metadata = {}) {
  const { error } = await supabase.from('audit_logs').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, metadata });
  if (error) console.error('Unable to write audit log:', error.message);
}

async function directoryMaps() {
  const [{ data: dentists, error: dentistError }, profileResult] = await Promise.all([
    supabase.from('dentists').select('id, display_name, specialty, is_active'),
    supabase.from('profiles').select('id, full_name, phone, role, is_active')
  ]);
  if (dentistError) throw dentistError;
  let profiles = profileResult.data;
  if (profileResult.error?.code === '42703') {
    const fallback = await supabase.from('profiles').select('id, full_name, phone, role');
    if (fallback.error) throw fallback.error;
    profiles = fallback.data.map((profile) => ({ ...profile, is_active: true }));
  } else if (profileResult.error) throw profileResult.error;
  return { dentists: new Map(dentists.map((item) => [item.id, item])), profiles: new Map(profiles.map((item) => [item.id, item])) };
}

async function assertBookableDentist(id) {
  const { data, error } = await supabase.from('dentists').select('id, is_active').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data?.is_active) throw new AppError(422, 'The selected dentist is inactive and cannot receive new bookings.');
}

async function assertActiveService(id) {
  const { data, error } = await supabase.from('services').select('id, duration_minutes, is_active').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data?.is_active) throw new AppError(422, 'The selected service is inactive.');
  return data;
}

async function assertNoAppointmentConflict({ dentistId, startsAt, endsAt, excludingId }) {
  const { data, error } = await supabase.from('appointments').select('id')
    .eq('dentist_id', dentistId).in('status', activeSlotStatuses)
    .lt('starts_at', endsAt).gt('ends_at', startsAt)
    .neq('id', excludingId || '00000000-0000-0000-0000-000000000000').limit(1);
  if (error) throw error;
  if (data.length) throw new AppError(409, 'That dentist already has an appointment in this time slot.');
}

router.use(...protectedAdmin);

router.get('/overview', async (_req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const start = `${today}T00:00:00.000Z`;
    const end = `${today}T23:59:59.999Z`;
    const [patients, accounts, dentists, todayBookings, pending, confirmed, completed, cancelled, noShow, recentBookings] = await Promise.all([
      supabase.from('patients').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('starts_at', start).lt('starts_at', end),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'no_show'),
      supabase.from('appointments').select('*, services(name)').order('created_at', { ascending: false }).limit(8)
    ]);
    const failed = [patients, accounts, dentists, todayBookings, pending, confirmed, completed, cancelled, noShow, recentBookings].find((result) => result.error);
    if (failed) throw failed.error;
    const recentLogs = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(8);
    if (recentLogs.error && !isMissingUpgrade(recentLogs.error)) throw recentLogs.error;
    const maps = await directoryMaps();
    const withDentists = recentBookings.data.map((item) => ({ ...item, dentist: maps.dentists.get(item.dentist_id) || null }));
    res.json({ data: { counts: { totalPatients: patients.count, totalAccounts: accounts.count, totalDentists: dentists.count, todayAppointments: todayBookings.count, pending: pending.count, confirmed: confirmed.count, completed: completed.count, cancelled: cancelled.count, noShow: noShow.count }, recentBookings: withDentists, recentActivity: recentLogs.data || [] } });
  } catch (error) { next(error); }
});

router.get('/accounts', async (req, res, next) => {
  try {
    const { page, perPage, start } = pageParams(req.query);
    const search = String(req.query.search || '').trim().toLowerCase();
    const role = roleValues.includes(req.query.role) ? req.query.role : null;
    const status = ['active', 'inactive'].includes(req.query.status) ? req.query.status : null;
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    const ids = data.users.map((user) => user.id);
    let { data: profiles, error: profileError } = ids.length ? await supabase.from('profiles').select('id, full_name, phone, role, is_active, created_at').in('id', ids) : { data: [], error: null };
    if (profileError?.code === '42703') {
      const fallback = await supabase.from('profiles').select('id, full_name, phone, role, created_at').in('id', ids);
      profiles = fallback.data?.map((profile) => ({ ...profile, is_active: true })) || [];
      profileError = fallback.error;
    }
    if (profileError) throw profileError;
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const rows = data.users.map((user) => ({ id: user.id, email: user.email, lastSignInAt: user.last_sign_in_at, createdAt: user.created_at, ...profileMap.get(user.id) }))
      .filter((row) => (!role || row.role === role) && (!status || (status === 'active') === Boolean(row.is_active)) && (!search || [row.id, row.email, row.full_name, row.phone, row.role].filter(Boolean).join(' ').toLowerCase().includes(search)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ data: rows.slice(start, start + perPage), meta: { page, perPage, total: rows.length } });
  } catch (error) { next(error); }
});

router.patch('/accounts/:id', async (req, res, next) => {
  try {
    const parsed = z.object({ fullName: z.string().trim().min(2).max(100).optional(), phone: z.string().trim().max(30).nullable().optional(), role: z.enum(roleValues).optional(), isActive: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Please check the account details.', parsed.error.flatten());
    if (req.params.id === req.user.id && (parsed.data.role && parsed.data.role !== 'admin' || parsed.data.isActive === false)) throw new AppError(422, 'You cannot remove or deactivate your own administrator access.');
    const changes = {};
    if (parsed.data.fullName !== undefined) changes.full_name = parsed.data.fullName;
    if (parsed.data.phone !== undefined) changes.phone = parsed.data.phone;
    if (parsed.data.role !== undefined) changes.role = parsed.data.role;
    if (parsed.data.isActive !== undefined) { changes.is_active = parsed.data.isActive; changes.deactivated_at = parsed.data.isActive ? null : new Date().toISOString(); }
    const { data, error } = await supabase.from('profiles').update(changes).eq('id', req.params.id).select().single();
    if (error) throw new AppError(404, 'Account not found.');
    await writeAudit(req.user.id, 'updated account', 'account', req.params.id, changes);
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/patients', async (req, res, next) => {
  try {
    const { page, perPage, start } = pageParams(req.query);
    const search = String(req.query.search || '').trim().toLowerCase();
    let { data: profiles, error } = await supabase.from('profiles').select('id, full_name, phone, is_active, created_at').eq('role', 'patient').order('created_at', { ascending: false });
    if (error?.code === '42703') {
      const fallback = await supabase.from('profiles').select('id, full_name, phone, created_at').eq('role', 'patient').order('created_at', { ascending: false });
      profiles = fallback.data?.map((profile) => ({ ...profile, is_active: true })) || [];
      error = fallback.error;
    }
    if (error) throw error;
    const ids = profiles.map((item) => item.id);
    const [patientRows, appointmentRows] = await Promise.all([
      ids.length ? supabase.from('patients').select('id, date_of_birth, address, medical_notes').in('id', ids) : { data: [], error: null },
      ids.length ? supabase.from('appointments').select('patient_id, starts_at, status').in('patient_id', ids) : { data: [], error: null }
    ]);
    if (patientRows.error) throw patientRows.error;
    if (appointmentRows.error) throw appointmentRows.error;
    const details = new Map(patientRows.data.map((item) => [item.id, item]));
    const bookings = appointmentRows.data.reduce((map, item) => map.set(item.patient_id, (map.get(item.patient_id) || 0) + 1), new Map());
    const rows = profiles.map((profile) => ({ ...profile, ...details.get(profile.id), appointmentCount: bookings.get(profile.id) || 0 }))
      .filter((row) => !search || [row.full_name, row.phone, row.address].filter(Boolean).join(' ').toLowerCase().includes(search));
    res.json({ data: rows.slice(start, start + perPage), meta: { page, perPage, total: rows.length } });
  } catch (error) { next(error); }
});

router.get('/dentists', async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from('dentists').select('*, dentist_schedules(*)').order('display_name');
    if (error) throw error;
    res.json({ data });
  } catch (error) { next(error); }
});

router.post('/dentists', async (req, res, next) => {
  try {
    const parsed = z.object({ fullName: z.string().trim().min(2).max(100), email: z.string().email(), password: z.string().min(12).max(100), specialty: z.string().trim().max(120).optional(), licenseNumber: z.string().trim().max(80).optional(), phone: z.string().trim().max(30).optional(), bio: z.string().trim().max(2000).optional(), imageUrl: z.string().url().optional().or(z.literal('')), appointmentDurationMinutes: z.number().int().min(10).max(240).default(30) }).safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Please check the dentist details.', parsed.error.flatten());
    const input = parsed.data;
    const created = await supabase.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName, phone: input.phone || '' } });
    if (created.error) throw new AppError(422, created.error.message);
    const id = created.data.user.id;
    const { error: profileError } = await supabase.from('profiles').upsert({ id, full_name: input.fullName, phone: input.phone || null, role: 'dentist', is_active: true });
    if (profileError) throw profileError;
    const { data, error } = await supabase.from('dentists').insert({ id, display_name: input.fullName, specialty: input.specialty || null, license_number: input.licenseNumber || null, email: input.email, phone: input.phone || null, bio: input.bio || null, image_url: input.imageUrl || null, appointment_duration_minutes: input.appointmentDurationMinutes }).select().single();
    if (error) throw error;
    await writeAudit(req.user.id, 'created dentist', 'dentist', id, { name: input.fullName });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

router.patch('/dentists/:id', async (req, res, next) => {
  try {
    const parsed = z.object({ fullName: z.string().trim().min(2).max(100).optional(), specialty: z.string().trim().max(120).nullable().optional(), licenseNumber: z.string().trim().max(80).nullable().optional(), email: z.string().email().nullable().optional(), phone: z.string().trim().max(30).nullable().optional(), bio: z.string().trim().max(2000).nullable().optional(), imageUrl: z.string().url().nullable().optional(), appointmentDurationMinutes: z.number().int().min(10).max(240).optional(), isActive: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Please check the dentist details.', parsed.error.flatten());
    const input = parsed.data;
    const changes = {};
    const mappings = { fullName: 'display_name', specialty: 'specialty', licenseNumber: 'license_number', email: 'email', phone: 'phone', bio: 'bio', imageUrl: 'image_url', appointmentDurationMinutes: 'appointment_duration_minutes', isActive: 'is_active' };
    Object.entries(mappings).forEach(([key, column]) => { if (input[key] !== undefined) changes[column] = input[key]; });
    if (input.isActive !== undefined) changes.deactivated_at = input.isActive ? null : new Date().toISOString();
    const { data, error } = await supabase.from('dentists').update(changes).eq('id', req.params.id).select().single();
    if (error) throw new AppError(404, 'Dentist not found.');
    if (input.fullName !== undefined || input.phone !== undefined || input.isActive !== undefined) await supabase.from('profiles').update({ ...(input.fullName !== undefined ? { full_name: input.fullName } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.isActive !== undefined ? { is_active: input.isActive, deactivated_at: input.isActive ? null : new Date().toISOString() } : {}) }).eq('id', req.params.id);
    await writeAudit(req.user.id, input.isActive === false ? 'deactivated dentist' : 'updated dentist', 'dentist', req.params.id, changes);
    res.json({ data });
  } catch (error) { next(error); }
});

router.put('/dentists/:id/schedule', async (req, res, next) => {
  try {
    const parsed = z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startsAt: z.string().regex(/^\d{2}:\d{2}/), endsAt: z.string().regex(/^\d{2}:\d{2}/), isAvailable: z.boolean().default(true) })).max(7).safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Please provide valid working days and hours.', parsed.error.flatten());
    const schedules = parsed.data.map((item) => ({ dentist_id: req.params.id, day_of_week: item.dayOfWeek, starts_at: item.startsAt, ends_at: item.endsAt, is_available: item.isAvailable }));
    const { error: deleteError } = await supabase.from('dentist_schedules').delete().eq('dentist_id', req.params.id);
    if (deleteError) throw deleteError;
    const { data, error } = schedules.length ? await supabase.from('dentist_schedules').insert(schedules).select() : { data: [], error: null };
    if (error) throw error;
    await writeAudit(req.user.id, 'updated dentist schedule', 'dentist', req.params.id, { days: schedules.length });
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/services', async (_req, res, next) => {
  try { const { data, error } = await supabase.from('services').select('*').order('name'); if (error) throw error; res.json({ data }); } catch (error) { next(error); }
});
router.post('/services', async (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).optional(), price: z.number().nonnegative(), durationMinutes: z.number().int().min(10).max(480), imageUrl: z.string().url().optional().or(z.literal('')), icon: z.string().trim().max(20).optional() }).safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Please check the service details.', parsed.error.flatten());
    const input = parsed.data;
    const { data, error } = await supabase.from('services').insert({ name: input.name, description: input.description || null, price: input.price, duration_minutes: input.durationMinutes, image_url: input.imageUrl || null, icon: input.icon || null }).select().single();
    if (error) throw new AppError(422, error.message);
    await writeAudit(req.user.id, 'created service', 'service', data.id, { name: data.name });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});
router.patch('/services/:id', async (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(2).max(120).optional(), description: z.string().trim().max(1000).nullable().optional(), price: z.number().nonnegative().optional(), durationMinutes: z.number().int().min(10).max(480).optional(), imageUrl: z.string().url().nullable().optional(), icon: z.string().trim().max(20).nullable().optional(), isActive: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Please check the service details.', parsed.error.flatten());
    const mapping = { durationMinutes: 'duration_minutes', imageUrl: 'image_url', isActive: 'is_active' };
    const changes = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [mapping[key] || key, value]));
    const { data, error } = await supabase.from('services').update(changes).eq('id', req.params.id).select().single();
    if (error) throw new AppError(404, 'Service not found.');
    await writeAudit(req.user.id, 'updated service', 'service', req.params.id, changes);
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/bookings', async (req, res, next) => {
  try {
    const { page, perPage, start } = pageParams(req.query);
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = statusValues.includes(req.query.status) ? req.query.status : null;
    let query = supabase.from('appointments').select('*, services(name, duration_minutes, price)').order(req.query.sort === 'oldest' ? 'starts_at' : 'created_at', { ascending: req.query.sort === 'oldest' });
    if (status) query = query.eq('status', status);
    if (req.query.from) query = query.gte('starts_at', req.query.from);
    if (req.query.to) query = query.lte('starts_at', req.query.to);
    const { data, error } = await query;
    if (error) throw error;
    const maps = await directoryMaps();
    const rows = data.map((item) => ({ ...item, dentist: maps.dentists.get(item.dentist_id) || null }))
      .filter((item) => !search || [item.id, item.patient_name, item.patient_email, item.patient_phone, item.services?.name, item.dentist?.display_name].filter(Boolean).join(' ').toLowerCase().includes(search));
    res.json({ data: rows.slice(start, start + perPage), meta: { page, perPage, total: rows.length } });
  } catch (error) { next(error); }
});

router.patch('/bookings/:id', async (req, res, next) => {
  try {
    const parsed = appointmentInput.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Please check the booking details.', parsed.error.flatten());
    const { data: existing, error: existingError } = await supabase.from('appointments').select('*').eq('id', req.params.id).single();
    if (existingError) throw new AppError(404, 'Booking not found.');
    const input = parsed.data;
    const dentistId = input.dentistId || existing.dentist_id;
    const serviceId = input.serviceId || existing.service_id;
    const service = await assertActiveService(serviceId);
    const startsAt = input.startsAt || existing.starts_at;
    const endsAt = new Date(new Date(startsAt).getTime() + service.duration_minutes * 60000).toISOString();
    const status = input.status || existing.status;
    if (activeSlotStatuses.includes(status)) {
      await assertBookableDentist(dentistId);
      await assertNoAppointmentConflict({ dentistId, startsAt, endsAt, excludingId: existing.id });
    }
    const changes = { dentist_id: dentistId, service_id: serviceId, starts_at: startsAt, ends_at: endsAt, status, ...(input.patientName !== undefined ? { patient_name: input.patientName } : {}), ...(input.patientPhone !== undefined ? { patient_phone: input.patientPhone } : {}), ...(input.patientEmail !== undefined ? { patient_email: input.patientEmail } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(input.adminNotes !== undefined ? { admin_notes: input.adminNotes } : {}) };
    const { data, error } = await supabase.from('appointments').update(changes).eq('id', existing.id).select('*, services(name, duration_minutes, price)').single();
    if (error?.code === '23P01') throw new AppError(409, 'That dentist already has an appointment in this time slot.');
    if (error) throw error;
    await writeAudit(req.user.id, 'updated booking', 'appointment', existing.id, { previousStatus: existing.status, status: data.status });
    res.json({ data });
  } catch (error) { next(error); }
});

router.get('/messages', async (_req, res, next) => { try { const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false }); if (error) throw error; res.json({ data }); } catch (error) { next(error); } });
router.get('/activity', async (req, res, next) => { try { const { page, perPage, start } = pageParams(req.query); const { data, error, count } = await supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(start, start + perPage - 1); if (error && isMissingUpgrade(error)) return res.json({ data: [], meta: { page, perPage, total: 0, upgradeRequired: true } }); if (error) throw error; res.json({ data, meta: { page, perPage, total: count } }); } catch (error) { next(error); } });
router.get('/settings', async (_req, res, next) => { try { const { data, error } = await supabase.from('clinic_settings').select('*').eq('id', true).single(); if (error) throw error; res.json({ data }); } catch (error) { next(error); } });
router.patch('/settings', async (req, res, next) => { try { const parsed = z.object({ clinicName: z.string().trim().min(2).max(120).optional(), address: z.string().trim().max(300).nullable().optional(), phone: z.string().trim().max(30).nullable().optional(), email: z.string().email().nullable().optional(), timezone: z.string().trim().max(100).optional(), appointmentIntervalMinutes: z.number().int().min(5).max(240).optional(), allowOnlineBooking: z.boolean().optional(), cancellationNoticeHours: z.number().int().min(0).max(720).optional() }).safeParse(req.body); if (!parsed.success) throw new AppError(422, 'Please check clinic settings.', parsed.error.flatten()); const mapping = { clinicName: 'clinic_name', appointmentIntervalMinutes: 'appointment_interval_minutes', allowOnlineBooking: 'allow_online_booking', cancellationNoticeHours: 'cancellation_notice_hours' }; const changes = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [mapping[key] || key, value])); const { data, error } = await supabase.from('clinic_settings').update(changes).eq('id', true).select().single(); if (error) throw error; await writeAudit(req.user.id, 'updated clinic settings', 'settings', null, changes); res.json({ data }); } catch (error) { next(error); } });

export { router as adminRouter, assertBookableDentist, assertNoAppointmentConflict, activeSlotStatuses };
