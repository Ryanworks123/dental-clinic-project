# Bright Smile Dental Clinic

React/Vite public site and dashboards with an Express API backed by Supabase PostgreSQL.

## Configure

1. Copy `.env.example` to `.env`.
2. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the API.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the browser client.
4. Run `supabase/migrations/20260816_dental_clinic.sql` in the Supabase SQL editor for a new database. If you previously ran the initial tables from this chat, run `supabase/migrations/20260816_existing_schema_upgrade.sql` instead.
5. Install and run: `npm install`, then `npm run dev`.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be prefixed with `VITE_`.
# Bright Smile Dental Clinic

## Super Admin database upgrade

Before opening the Super Admin workspace, run [20260816_super_admin.sql](supabase/migrations/20260816_super_admin.sql) in **Supabase Dashboard → SQL Editor**. It adds account activation state, dentist profile fields, dentist schedules, audit logs, indexes, and admin-only RLS policies without removing historical appointments.

After it succeeds, restart the API (`npm run dev:api`) and open `/admin` while signed in with the administrator account.

## Automatic no-shows

While the API is running, the server checks appointments every 15 minutes and automatically changes `pending`, `confirmed`, or `rescheduled` visits to `no_show` one hour after their scheduled start time. Set `NO_SHOW_CHECK_INTERVAL_MINUTES` or `NO_SHOW_GRACE_MINUTES` in `.env` to adjust the timing.

For Vercel deployments, schedule `GET /api/no-show` every 15 minutes with the `Authorization: Bearer <CRON_SECRET>` header. This repository includes a GitHub Actions scheduler for Vercel Hobby; add `CRON_SECRET` to the repository's Actions secrets with the same value used in Vercel. Vercel Pro can alternatively run the schedule itself.
