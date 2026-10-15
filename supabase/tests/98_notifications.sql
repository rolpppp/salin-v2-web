-- Streak + reminders (ticket 31): prefs and reads are private per user.
begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

select ok((select relrowsecurity from pg_class where oid = 'public.notification_prefs'::regclass), 'prefs have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.notification_reads'::regclass), 'reads have RLS');
select ok(not has_table_privilege('anon', 'public.notification_prefs', 'select'), 'anon cannot read prefs');
select ok(not has_table_privilege('authenticated', 'public.notification_reads', 'delete'), 'reads are never deleted by users');

set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.notification_prefs ("dailyLogAt", browser) values ('21:30', true);
select is((select jsonb_build_object('daily', "dailyLog", 'at', "dailyLogAt"::text, 'risk', "streakRisk", 'browser', browser) from public.notification_prefs),
  '{"daily":true,"at":"21:30:00","risk":true,"browser":true}'::jsonb, 'defaults fill the rest');
insert into public.notification_reads (key) values ('daily_log:2026-10-15');
select throws_ok($$insert into public.notification_reads (key) values ('daily_log:2026-10-15')$$, '23505', null, 'a key is read once');
select throws_ok($$insert into public.notification_reads (key) values ('x')$$, '23514', null, 'keys have a sane length');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select is((select count(*)::int from public.notification_prefs), 0, 'B cannot see A''s prefs');
select is((select count(*)::int from public.notification_reads), 0, 'B cannot see A''s reads');
update public.notification_prefs set browser = false;
select throws_ok($$insert into public.notification_prefs (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'B cannot write a row for A');
select throws_ok($$insert into public.notification_reads (user_id, key) values ('aaaaaaaa-0000-0000-0000-000000000001', 'daily_log:x')$$, '42501', null, 'B cannot mark A''s notices');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is((select browser from public.notification_prefs), true, 'B''s update did not reach A');

select * from finish();
rollback;
