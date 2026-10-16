-- Settings (ticket 37, P-13): set_income_rhythm, set_profile_basics, finish_onboarding keeps amount + rhythm, week start change.
begin;
select plan(43);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.user_profiles (user_id, "firstName", "onboardedAt", "viewMode", "spendUntil", "nextPaydayDate") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana', 1, 'simple', current_date + 10, current_date + 10),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Ben', 1, 'full', null, current_date + 3),
  ('eeeeeeee-0000-0000-0000-000000000005', 'Eve', 1, 'full', null, current_date - 4);

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.today() returns date language sql as $$ select public.entry_local_date(public.now_ms()) $$;
grant execute on function pg_temp.today() to authenticated;

select ok(not has_function_privilege('anon', 'public.set_income_rhythm(bigint, text, date)', 'execute'), 'anon cannot execute set_income_rhythm');
select ok(not has_function_privilege('anon', 'public.set_profile_basics(text, integer, integer)', 'execute'), 'anon cannot execute set_profile_basics');
select ok(has_function_privilege('authenticated', 'public.set_income_rhythm(bigint, text, date)', 'execute'), 'authenticated can execute set_income_rhythm');
select has_column('public', 'user_profiles', 'payAmountMinor', 'payAmountMinor exists');
select has_column('public', 'user_profiles', 'payRhythm', 'payRhythm exists');

set local role authenticated;

-- =========================================================== A: set_income_rhythm
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is((select "payAmountMinor" from public.user_profiles), null, 'existing users start with no amount');
select is((select "payRhythm" from public.user_profiles), null, 'existing users start with no rhythm');
select lives_ok($$select public.set_income_rhythm(150000, 'quarterly', pg_temp.today() + 20)$$, 'set a quarterly rhythm with a date');
select is((select jsonb_build_object('amt', "payAmountMinor", 'rhythm', "payRhythm", 'freq', "payFrequency",
                                     'next', "nextPaydayDate" = pg_temp.today() + 20, 'until', "spendUntil" = pg_temp.today() + 20)
             from public.user_profiles),
  '{"amt":150000,"rhythm":"quarterly","freq":"varies","next":true,"until":true}'::jsonb,
  'quarterly stays quarterly in payRhythm, varies in payFrequency; spendUntil follows because it was set');
select lives_ok($$select public.set_income_rhythm(150000, 'semester', pg_temp.today() + 20)$$, 'semester is allowed');
select is((select "payFrequency" from public.user_profiles), 'varies', 'semester maps to varies');
select lives_ok($$select public.set_income_rhythm(90000, 'twice', pg_temp.today() + 5)$$, 'twice a month');
select is((select "payFrequency" from public.user_profiles), 'twice', 'twice stays twice in payFrequency');
select lives_ok($$select public.set_income_rhythm(90000, 'twice', null)$$, 'clearing the date is fine');
select is((select jsonb_build_object('next', "nextPaydayDate", 'until', "spendUntil") from public.user_profiles),
  '{"next":null,"until":null}'::jsonb, 'clearing the date clears nextPaydayDate and spendUntil');
select lives_ok($$select public.set_income_rhythm(null, null, null)$$, 'every argument may be null');
select is((select jsonb_build_object('amt', "payAmountMinor", 'rhythm', "payRhythm", 'freq', "payFrequency") from public.user_profiles),
  '{"amt":null,"rhythm":null,"freq":null}'::jsonb, 'null means not set');
select throws_ok($$select public.set_income_rhythm(0, 'weekly', null)$$, '22023', null, 'zero amount refused');
select throws_ok($$select public.set_income_rhythm(1000000001, 'weekly', null)$$, '22023', null, 'too large an amount refused');
select throws_ok($$select public.set_income_rhythm(1000, 'daily', null)$$, '22023', 'Pick how often the money comes.', 'unknown rhythm refused');
select throws_ok($$select public.set_income_rhythm(1000, 'weekly', pg_temp.today() - 1)$$, '22023', 'Pick today or a later date.', 'a past date is refused');
select is((select "payAmountMinor" from public.user_profiles), null, 'refused calls changed nothing');

-- spendUntil stays null when it was null (the date only follows when Simple view already had one)
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$select public.set_income_rhythm(50000, 'weekly', pg_temp.today() + 6)$$, 'B: set a weekly rhythm');
select is((select jsonb_build_object('next', "nextPaydayDate" = pg_temp.today() + 6, 'until', "spendUntil") from public.user_profiles),
  '{"next":true,"until":null}'::jsonb, 'B: spendUntil stays empty when it was empty');

-- an unchanged stale date can be kept while the amount changes
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
select lives_ok($$select public.set_income_rhythm(70000, 'monthly', pg_temp.today() - 4)$$, 'E: keeping the date already saved is allowed even if it passed');
select throws_ok($$select public.set_income_rhythm(70000, 'monthly', pg_temp.today() - 3)$$, '22023', null, 'E: a different past date is refused');

-- =========================================================== B: set_profile_basics
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$select public.set_profile_basics('  Mika  ', 0, 3)$$, 'set the basics');
select is((select jsonb_build_object('name', "firstName", 'ws', "weekStartsOn", 'rd', "reviewDay") from public.user_profiles),
  '{"name":"Mika","ws":0,"rd":3}'::jsonb, 'name trimmed, week start and review day saved');
select lives_ok($$select public.set_profile_basics('   ', 1, 6)$$, 'an empty name is fine');
select is((select "firstName" from public.user_profiles), null, 'an empty name becomes null');
select throws_ok($$select public.set_profile_basics(repeat('x', 61), 1, 0)$$, '22023', null, 'a name over 60 characters is refused');
select throws_ok($$select public.set_profile_basics('Mika', 2, 0)$$, '22023', null, 'week start must be 0 or 1');
select throws_ok($$select public.set_profile_basics('Mika', 1, 7)$$, '22023', null, 'review day must be 0..6');
select throws_ok($$select public.set_profile_basics('Mika', null, 1)$$, '22023', null, 'week start is required');

-- user B cannot change user A: each user only ever writes their own row
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$select public.set_profile_basics('Ben', 1, 0)$$, 'B changes their own basics');
select is((select "firstName" from public.user_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), null, 'B cannot see A''s profile');
reset role;
select is((select "reviewDay" from public.user_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 6, 'A''s profile is unchanged by B');
set local role authenticated;

-- no profile row: refused with a message
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select throws_ok($$select public.set_profile_basics('Cy', 1, 0)$$, 'P0001', 'Finish setting up first.', 'no profile: set_profile_basics says finish setting up');
select throws_ok($$select public.set_income_rhythm(1000, 'weekly', null)$$, 'P0001', 'Finish setting up first.', 'no profile: set_income_rhythm says finish setting up');

-- =========================================================== C: week start change keeps closed weeks as records
reset role;
insert into public.week_reviews (user_id, "weekStart", checks, "safeToSpendMinor") values
  ('aaaaaaaa-0000-0000-0000-000000000001', date_trunc('week', current_date)::date - 7, '{"assign":true,"transfers":true,"living":true}', 1000);
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$select public.set_profile_basics('Mika', 1, 0)$$, 'A: back to Monday');
select lives_ok($$select public.set_profile_basics('Mika', 0, 0)$$, 'A: switch the week to Sunday');
select is((select count(*)::int from public.week_reviews), 1, 'a closed week is still there after the change');
select throws_ok(format($f$select * from public.close_week(%L)$f$, date_trunc('week', current_date)::date),
  '22023', 'That date is not the first day of your week.', 'a Monday is no longer a week start: close_week refuses it');

select * from finish();
rollback;
