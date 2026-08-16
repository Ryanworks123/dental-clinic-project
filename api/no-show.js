import { config } from '../server/config.js';
import { markMissedAppointments } from '../server/no-show.js';

export default async function noShowCron(request, response) {
  const authorization = request.headers.authorization;
  if (!config.cronSecret || authorization !== `Bearer ${config.cronSecret}`) return response.status(401).json({ error: 'Unauthorized cron request.' });
  try {
    const marked = await markMissedAppointments(config.noShowGraceMinutes);
    return response.status(200).json({ marked: marked.length });
  } catch (error) {
    console.error('Vercel no-show cron failed:', error.message);
    return response.status(500).json({ error: 'Automatic no-show check failed.' });
  }
}
