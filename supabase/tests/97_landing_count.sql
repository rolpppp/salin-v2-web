-- Landing sign-up count (ticket 30): counts sign-ups since a moment, readable by anon, leaks nothing else.
begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '2026-10-01 10:00+08'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '2026-10-16 10:00+08'),
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '2026-10-20 10:00+08');

select ok(has_function_privilege('anon', 'public.landing_signup_count(timestamptz)', 'execute'), 'anon can read the count');
select is(pg_get_function_result('public.landing_signup_count(timestamptz)'::regprocedure), 'integer', 'returns a single integer');

set local role anon;
select is(public.landing_signup_count('2026-10-15 00:00+08'), 2, 'counts sign-ups on or after the moment');
select is(public.landing_signup_count('2027-01-01 00:00+08'), 0, 'none after a later moment');
select throws_ok($$select count(*) from auth.users$$, '42501', null, 'anon still cannot read auth.users directly');

select * from finish();
rollback;
