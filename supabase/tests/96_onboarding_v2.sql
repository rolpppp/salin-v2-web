-- Onboarding v2 (P-12, ticket 29): allowance / mix finish into Simple view with their first money.
begin;
select plan(18);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

-- an allowance draft. p_next / p_first are json text (null / a date string / an object).
create function pg_temp.d(p text, p_pattern text, p_next text, p_first text) returns jsonb language sql as $$
  select replace(replace(replace(replace($j$
  {"v":1,"path":"web","step":"money","skipped":true,"planOnly":false,"firstName":"Mika",
   "pattern":"PATTERN",
   "rhythm":{"amountMinor":150000,"frequency":"weekly","nextDate":NEXT},
   "firstMoney":FIRST,
   "income":{"kind":"allowance","amountMinor":150000,"frequency":"weekly","nextPayday":NEXT,"paidInOtherCurrency":false},
   "sources":[{"key":"main","name":"Allowance","kind":"allowance","rule":"plan","wholeBucket":null,"ownSplit":null,"landsInAccountId":"PFX-cash","categoryId":null,"isMain":true}],
   "accounts":[{"id":"PFX-cash","name":"Cash","type":"cash","currency":"PHP","isNew":true},
               {"id":"PFX-gcash","name":"GCash","type":"eWallet","currency":"PHP","isNew":true}],
   "landingAccountId":"PFX-cash","priority":null,"goal":null,"billsMinor":0,"billKinds":[],"billsStart":null,
   "preset":"suggested","planA":null,"planEdited":false,"planInputsSig":null,"planBOn":true,"targetMinor":null,
   "homes":null,"homesUserSet":[],"categories":null,
   "firstPay":{"choice":null,"entryId":null,"amountMinor":null,"date":null,"splitConfirmed":false,"ticked":[],"reminder":"none"}}
  $j$, 'PFX', p), 'PATTERN', p_pattern), 'NEXT', p_next), 'FIRST', p_first)::jsonb $$;

set local role authenticated;

-- =========================================================== A: allowance, next date, first money
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok(
  format($f$select public.finish_onboarding(pg_temp.d('a', 'allowance', %L, '{"amountMinor":200000,"extra":{"a-gcash":50000},"keepMinor":30000}'))$f$,
         '"' || to_char(current_date + 5, 'YYYY-MM-DD') || '"'),
  'allowance draft with first money finishes');
select is((select jsonb_build_object('mode', "viewMode", 'until', "spendUntil" = current_date + 5, 'plan', "planMode", 'freq', "payFrequency") from public.user_profiles),
  '{"mode":"simple","until":true,"plan":"track","freq":"weekly"}'::jsonb, 'profile: Simple view, spend-until = the next date, just tracking');
select is((select jsonb_build_object('amt', "payAmountMinor", 'rhythm', "payRhythm") from public.user_profiles), '{"amt":150000,"rhythm":"weekly"}'::jsonb, 'the rhythm answers are stored (ticket 37)');
select is((select count(*)::int from public.ledger_entries where direction = 0 and "amountMinor" = 200000 and "accountId" = 'a-cash'), 1, 'the first money is one inflow on the landing account');
select is((select jsonb_object_agg(b.hue || ':' || a."destAccountId", a."amountMinor") from public.allocations a join public.buckets b on b.id = a."bucketId"),
  '{"living:a-cash":120000,"living:a-gcash":50000,"emergency:a-cash":30000}'::jsonb, 'spending in Cash and GCash, kept aside to Emergency in Cash');
select is((select job from public.income_meta), 'manual', 'recorded as a manual job');
select is((select count(*)::int from public.transfer_plan() where kind = 'transfer' and from_account_id = 'a-cash' and to_account_id = 'a-gcash' and amount = 50000), 1, 'the GCash share shows up as a move');

-- B: next date unknown, no first money: still finishes, spendUntil null
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($f$select public.finish_onboarding(jsonb_set(jsonb_set(pg_temp.d('b', 'mix', 'null', 'null'), '{rhythm,frequency}', '"quarterly"'), '{income,frequency}', '"varies"'))$f$, 'mix draft with no date and no first money finishes');
select is((select jsonb_build_object('amt', "payAmountMinor", 'rhythm', "payRhythm", 'freq', "payFrequency") from public.user_profiles),
  '{"amt":150000,"rhythm":"quarterly","freq":"varies"}'::jsonb, 'B: quarterly stays quarterly in payRhythm, varies in payFrequency (ticket 37)');
select is((select jsonb_build_object('mode', "viewMode", 'until', "spendUntil", 'next', "nextPaydayDate") from public.user_profiles),
  '{"mode":"simple","until":null,"next":null}'::jsonb, 'unknown date: spend-until stays empty');
select is((select count(*)::int from public.ledger_entries), 0, 'no first money, no entry');

-- C: salary draft (no pattern) is untouched: full view, next payday still required
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select throws_ok(
  $f$select public.finish_onboarding((pg_temp.d('c', 'salary', 'null', 'null') - 'pattern') || '{"skipped":false,"priority":"safety"}'::jsonb)$f$,
  '22023', null, 'a draft without a pattern still needs its next payday (and plan)');

-- D: refusals
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select throws_ok($f$select public.finish_onboarding(pg_temp.d('d', 'allowance', 'null', '{"amountMinor":100000,"extra":{"d-gcash":90000},"keepMinor":20000}'))$f$,
  '22023', null, 'moved + kept aside above what you have is refused');
select throws_ok($f$select public.finish_onboarding(pg_temp.d('d', 'allowance', 'null', 'null') || '{"skipped":false}'::jsonb)$f$,
  '22023', null, 'allowance with a plan (not just tracking) is refused');
select throws_ok($f$select public.finish_onboarding(jsonb_set(pg_temp.d('d', 'allowance', 'null', 'null'), '{rhythm,frequency}', '"daily"'))$f$,
  '22023', null, 'an unknown rhythm frequency is refused');
select is((select count(*)::int from public.user_profiles where "onboardedAt" is not null), 0, 'D: nothing was written by the refused calls');
select is((select count(*)::int from public.accounts), 0, 'D: no accounts leaked from the refused calls');

-- an amount left on an account that is not in the draft any more is ignored, not an error
select lives_ok($f$select public.finish_onboarding(pg_temp.d('d', 'allowance', 'null', '{"amountMinor":100000,"extra":{"d-ghost":10000},"keepMinor":0}'))$f$, 'D: an amount on an unticked account is ignored');

select * from finish();
rollback;
