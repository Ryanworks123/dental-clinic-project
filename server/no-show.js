import { supabase } from './supabase.js';

const eligibleStatuses = ['pending', 'confirmed', 'rescheduled'];

/**
 * Marks appointments as no-show only after the configured grace period from their start time.
 * Cancelled and completed visits are deliberately never changed.
 */
export async function markMissedAppointments(graceMinutes = 60) {
  const cutoff = new Date(Date.now() - Math.max(0, graceMinutes) * 60 * 1000).toISOString();
  const { data, error } = await supabase.from('appointments')
    .update({ status: 'no_show' })
    .in('status', eligibleStatuses)
    .lt('starts_at', cutoff)
    .select('id, patient_name, starts_at, ends_at');
  if (error) throw error;

  if (data.length) {
    const { error: auditError } = await supabase.from('audit_logs').insert(data.map((appointment) => ({
      action: 'automatically marked appointment as no-show',
      entity_type: 'appointment',
      entity_id: appointment.id,
      metadata: { patientName: appointment.patient_name, startsAt: appointment.starts_at, endedAt: appointment.ends_at }
    })));
    if (auditError) console.error('Unable to log automatic no-shows:', auditError.message);
  }
  return data;
}

export function startNoShowScheduler(intervalMinutes = 15, graceMinutes = 60) {
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  const run = async () => {
    try {
      const marked = await markMissedAppointments(graceMinutes);
      if (marked.length) console.log(`Automatically marked ${marked.length} missed appointment(s) as no-show.`);
    } catch (error) { console.error('Automatic no-show check failed:', error.message); }
  };
  setTimeout(run, 5_000);
  return setInterval(run, intervalMs);
}
