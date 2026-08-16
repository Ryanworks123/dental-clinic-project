import 'dotenv/config';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
export const missingServerConfig = required.filter((key) => !process.env[key]);

export const config = {
  port: Number(process.env.PORT || 3001),
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  gmailUser: process.env.GMAIL_USER,
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
  bookingNotificationEmail: process.env.BOOKING_NOTIFICATION_EMAIL || process.env.GMAIL_USER,
  noShowCheckIntervalMinutes: Number(process.env.NO_SHOW_CHECK_INTERVAL_MINUTES || 15),
  noShowGraceMinutes: Number(process.env.NO_SHOW_GRACE_MINUTES || 60),
  cronSecret: process.env.CRON_SECRET
};
