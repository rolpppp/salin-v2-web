-- Streak + reminders (ticket 31, P-13). Web-only tables (the 12 mobile tables are untouched); the phone app reads and writes
-- the same rows through Supabase when online (salin-v2/STREAK_AND_NOTIFICATIONS.md).
--   notification_prefs: one row per user, which reminders are on and when the daily nudge fires (local time).
--   notification_reads: which in-app notices the user has seen, by stable key ("daily_log:2026-10-15").
-- No sender, cron or push service: notices are computed when the app loads, and devices schedule their own reminders.

create table public.notification_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  "dailyLog" boolean not null default true,
  "dailyLogAt" time not null default '20:00',
  "streakRisk" boolean not null default true,
  "moneyDay" boolean not null default true,
  "weeklyReview" boolean not null default true,
  -- Browser notifications while a Salin tab is open (needs the browser's permission too).
  browser boolean not null default false,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms()
);

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
create policy "notification_prefs_select_own" on public.notification_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy "notification_prefs_insert_own" on public.notification_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "notification_prefs_update_own" on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.notification_prefs to authenticated;
create trigger notification_prefs_set_updated_at before insert or update on public.notification_prefs
  for each row execute function public.set_updated_at_ms();

create table public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 3 and 80),
  "readAt" bigint not null default public.now_ms()
);
create unique index notification_reads_user_key_uq on public.notification_reads (user_id, key);

alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from anon, authenticated;
create policy "notification_reads_select_own" on public.notification_reads for select to authenticated using (user_id = (select auth.uid()));
create policy "notification_reads_insert_own" on public.notification_reads for insert to authenticated with check (user_id = (select auth.uid()));
grant select, insert on public.notification_reads to authenticated;
