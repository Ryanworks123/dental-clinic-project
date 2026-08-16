import 'dotenv/config';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
export const missingServerConfig = required.filter((key) => !process.env[key]);

export const config = {
  port: Number(process.env.PORT || 3001),
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  emailProvider: process.env.EMAIL_PROVIDER || (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD ? 'gmail' : 'resend'),
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL,
  adminEmail: process.env.ADMIN_EMAIL || process.env.BOOKING_NOTIFICATION_EMAIL,
  gmailUser: process.env.GMAIL_USER,
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
  authRedirectUrl: process.env.AUTH_REDIRECT_URL || process.env.VITE_AUTH_REDIRECT_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/login` : 'http://localhost:5173/login'),
  noShowCheckIntervalMinutes: Number(process.env.NO_SHOW_CHECK_INTERVAL_MINUTES || 15),
  noShowGraceMinutes: Number(process.env.NO_SHOW_GRACE_MINUTES || 60),
  cronSecret: process.env.CRON_SECRET
};
