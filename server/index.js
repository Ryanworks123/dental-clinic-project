import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { config, missingServerConfig } from './config.js';
import { supabase } from './supabase.js';
import { AppError, errorHandler } from './errors.js';
import { requireAuth, loadRole, allowRoles } from './middleware/auth.js';
import { sendBookingNotification, sendContactNotification } from './email.js';
import { adminRouter, assertBookableDentist, assertNoAppointmentConflict, activeSlotStatuses } from './admin.js';
import { startNoShowScheduler } from './no-show.js';

const app = express();
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
    if (!origin || config.clientOrigins.includes(origin) || origin === vercelOrigin) return callback(null, true);
    return callback(new AppError(403, 'This origin is not allowed to call the API.'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE']
}));
app.use(express.json({ limit: '32kb' }));
app.use(morgan('tiny'));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: 'draft-8', legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, configured: missingServerConfig.length === 0, mailConfigured: Boolean(config.gmailUser && config.gmailAppPassword && config.bookingNotificationEmail), missing: missingServerConfig }));

app.use('/api', (req, _res, next) => {
  if (missingServerConfig.length) return next(new AppError(503, `Server configuration is incomplete: ${missingServerConfig.join(', ')}.`));
  next();
});

app.use('/api/admin', adminRouter);

app.get('/api/services', async (_req, res, next) => {
  const { data, error } = await supabase.from('services').select('*').eq('is_active', true).order('name');
  if (error) return next(error);
  res.json({ data });
});

app.get('/api/dentists', async (_req, res, next) => {
  const { data, error } = await supabase.from('dentists').select('id, display_name, specialty, bio, image_url').eq('is_active', true).order('display_name');
  if (error) return next(error);
  res.json({ data });
});

app.post('/api/auth/register', async (req, res, next) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(8), fullName: z.string().trim().min(2).max(100), phone: z.string().trim().min(7).max(30) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(422, 'Please check the registration details.', parsed.error.flatten()));
  const { email, password, fullName, phone } = parsed.data;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: false, user_metadata: { full_name: fullName, phone } });
  if (error) return next(new AppError(400, error.message));
  res.status(201).json({ data: { id: data.user.id, email: data.user.email } });
});

app.get('/api/auth/me', requireAuth, loadRole, async (req, res, next) => {
  const { data, error } = await supabase.from('profiles').select('id, full_name, phone, role').eq('id', req.user.id).single();
  if (error) return next(error);
  res.json({ data });
});

app.get('/api/appointments', requireAuth, loadRole, async (req, res, next) => {
  // Existing projects link appointments.dentist_id directly to auth.users.
  // Do not request an inferred dentists join until a matching FK exists.
  let query = supabase.from('appointments').select('*, services(name, duration_minutes, price)').order('starts_at', { ascending: false });
  if (req.role === 'patient') query = query.eq('patient_id', req.user.id);
  if (req.role === 'dentist') query = query.eq('dentist_id', req.user.id);
  const { data, error } = await query;
  if (error) return next(error);
  res.json({ data });
});

app.post('/api/appointments', requireAuth, loadRole, async (req, res, next) => {
  const schema = z.object({ serviceId: z.string().uuid(), dentistId: z.string().uuid(), startsAt: z.string().datetime(), endsAt: z.string().datetime(), patientName: z.string().trim().min(2).max(100), patientPhone: z.string().trim().min(7).max(30), patientEmail: z.string().email().optional().or(z.literal('')), notes: z.string().trim().max(1000).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(422, 'Please check the appointment details.', parsed.error.flatten()));
  const input = parsed.data;
  if (new Date(input.endsAt) <= new Date(input.startsAt)) return next(new AppError(422, 'Appointment end time must be after its start time.'));
  try {
    await assertBookableDentist(input.dentistId);
    await assertNoAppointmentConflict({ dentistId: input.dentistId, startsAt: input.startsAt, endsAt: input.endsAt });
  } catch (availabilityError) { return next(availabilityError); }
  const { data, error } = await supabase.from('appointments').insert({ service_id: input.serviceId, dentist_id: input.dentistId, starts_at: input.startsAt, ends_at: input.endsAt, patient_id: req.role === 'patient' ? req.user.id : null, patient_name: input.patientName, patient_phone: input.patientPhone, patient_email: input.patientEmail || null, notes: input.notes || null }).select().single();
  if (error?.code === '23P01') return next(new AppError(409, 'That dentist is no longer available at the chosen time.'));
  if (error) return next(error);
  const { data: administrators, error: administratorError } = await supabase.from('profiles').select('id').in('role', ['admin', 'staff']);
  if (administratorError) return next(administratorError);
  if (administrators.length) {
    const notifications = administrators.map((administrator) => ({
      recipient_id: administrator.id,
      title: 'New appointment request',
      body: `${data.patient_name} requested an appointment for ${new Date(data.starts_at).toLocaleString()}.`
    }));
    const { error: notificationError } = await supabase.from('notifications').insert(notifications);
    if (notificationError) return next(notificationError);
  }
  let notificationEmailSent = false;
  try { notificationEmailSent = await sendBookingNotification(data); } catch (mailError) { console.error('Booking email notification failed:', mailError.message); }
  res.status(201).json({ data: { ...data, notificationEmailSent } });
});

// Patients may move their own active appointment until five hours before it starts.
// The deadline is deliberately enforced here (not just in the UI) so it cannot be bypassed.
app.patch('/api/appointments/:id/reschedule', requireAuth, loadRole, allowRoles('patient'), async (req, res, next) => {
  const parsed = z.object({ startsAt: z.string().datetime() }).safeParse(req.body);
  if (!parsed.success) return next(new AppError(422, 'Please choose a valid new appointment time.'));

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, dentist_id, starts_at, ends_at, status, patient_id')
    .eq('id', req.params.id)
    .eq('patient_id', req.user.id)
    .maybeSingle();
  if (appointmentError) return next(appointmentError);
  if (!appointment) return next(new AppError(404, 'Appointment not found.'));
  if (!activeSlotStatuses.includes(appointment.status)) return next(new AppError(422, 'This appointment can no longer be rescheduled.'));

  const deadline = new Date(new Date(appointment.starts_at).getTime() - 5 * 60 * 60 * 1000);
  if (Date.now() >= deadline.getTime()) return next(new AppError(422, 'Appointments can only be rescheduled at least 5 hours before the scheduled time.'));

  const startsAt = new Date(parsed.data.startsAt);
  if (startsAt.getTime() <= Date.now()) return next(new AppError(422, 'Please choose a future appointment time.'));
  const durationMs = new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime();
  const endsAt = new Date(startsAt.getTime() + durationMs).toISOString();
  try {
    await assertNoAppointmentConflict({ dentistId: appointment.dentist_id, startsAt: startsAt.toISOString(), endsAt, excludingId: appointment.id });
  } catch (availabilityError) { return next(availabilityError); }

  const { data, error } = await supabase.from('appointments')
    .update({ starts_at: startsAt.toISOString(), ends_at: endsAt, status: 'rescheduled' })
    .eq('id', appointment.id)
    .eq('patient_id', req.user.id)
    .select('*, services(name, duration_minutes, price)')
    .single();
  if (error) return next(error);
  res.json({ data });
});

app.post('/api/messages', async (req, res, next) => {
  const schema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email(), phone: z.string().trim().min(7).max(30).optional().or(z.literal('')), subject: z.string().trim().min(2).max(150), message: z.string().trim().min(5).max(5000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return next(new AppError(422, 'Please check your message details.', parsed.error.flatten()));
  const { data, error } = await supabase.from('messages').insert(parsed.data).select().single();
  if (error) return next(error);
  let notificationEmailSent = false;
  try { notificationEmailSent = await sendContactNotification(data); } catch (mailError) { console.error('Contact email notification failed:', mailError.message); }
  res.status(201).json({ data: { ...data, notificationEmailSent } });
});

app.get('/api/notifications', requireAuth, async (req, res, next) => {
  const { data, error } = await supabase.from('notifications').select('*').eq('recipient_id', req.user.id).order('created_at', { ascending: false }).limit(12);
  if (error) return next(error);
  res.json({ data });
});

app.patch('/api/notifications/:id/read', requireAuth, async (req, res, next) => {
  const { data, error } = await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('recipient_id', req.user.id).select().single();
  if (error) return next(new AppError(404, 'Notification not found.'));
  res.json({ data });
});

app.patch('/api/appointments/:id/status', requireAuth, loadRole, allowRoles('admin', 'staff', 'dentist'), async (req, res, next) => {
  const parsed = z.object({ status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show']) }).safeParse(req.body);
  if (!parsed.success) return next(new AppError(422, 'A valid appointment status is required.'));
  let query = supabase.from('appointments').update({ status: parsed.data.status }).eq('id', req.params.id);
  if (req.role === 'dentist') query = query.eq('dentist_id', req.user.id);
  const { data, error } = await query.select().single();
  if (error) return next(new AppError(404, 'Appointment not found.'));
  res.json({ data });
});

app.get('/api/admin/summary', requireAuth, loadRole, allowRoles('admin'), async (_req, res, next) => {
  const today = new Date().toISOString().slice(0, 10);
  const [todayAppointments, pendingAppointments, patients, dentists] = await Promise.all([
    supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('starts_at', `${today}T00:00:00.000Z`).lt('starts_at', `${today}T23:59:59.999Z`),
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('patients').select('*', { count: 'exact', head: true }),
    supabase.from('dentists').select('*', { count: 'exact', head: true }).eq('is_active', true)
  ]);
  const failed = [todayAppointments, pendingAppointments, patients, dentists].find((result) => result.error);
  if (failed) return next(failed.error);
  res.json({ data: { todayAppointments: todayAppointments.count, pendingAppointments: pendingAppointments.count, totalPatients: patients.count, activeDentists: dentists.count } });
});

// Make the local API address useful when it is opened directly. Vite remains
// the preferred development server (http://localhost:5173), while this lets
// `npm start` and preview tools show the built website instead of "Cannot GET /".
const localBuildDirectory = path.resolve(process.cwd(), 'dist');
if (!process.env.VERCEL && existsSync(localBuildDirectory)) {
  app.use(express.static(localBuildDirectory));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(localBuildDirectory, 'index.html'));
  });
}

app.use(errorHandler);
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Dental API listening on port ${config.port}`);
    startNoShowScheduler(config.noShowCheckIntervalMinutes, config.noShowGraceMinutes);
  });
}

export default app;
