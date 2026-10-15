-- Simple Money (ticket 28, P-11): receive_money, the setters, day_checkins RLS, the widened allocations index.
begin;
select plan(97);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-bank', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bank',  1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-cash', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cash',  0, 0, 'PHP', 'i', 2, false, 1, 1, 2),
  ('acc-gc',   'aaaaaaaa-0000-0000-0000-000000000001', 'GCash', 3, 0, 'PHP', 'i', 3, false, 1, 1, 2),
  ('acc-old',  'aaaaaaaa-0000-0000-0000-000000000001', 'Old',   1, 0, 'PHP', 'i', 4, true,  1, 1, 2),
  ('acc-aud',  'aaaaaaaa-0000-0000-0000-000000000001', 'AUD',   1, 0, 'AUD', 'i', 5, false, 1, 1, 2),
  ('acc-b',    'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank', 1, 0, 'PHP', 'i', 1, false, 1, 1, 2);

insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder", "isArchived") values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living',    'spend', 'living',    'acc-cash', false, 1, false),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency', 'save',  'emergency', 'acc-bank', false, 2, false),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',       'spend', 'fun',       'acc-gc',   false, 3, false),
  ('b1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Old',       'save',  null,        'acc-bank', false, 4, true),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Emergency', 'save',  'emergency', 'acc-b',    false, 1, false);

insert into public.user_profiles (user_id, "firstName", "onboardedAt") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Ben', 1);

insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Allowance', 'other', 'ask', 'acc-bank'),
  ('d2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Pay',     'other', 'ask', 'acc-b');

create temp table k (name text primary key, v text);
grant select, insert, update on k to authenticated;
create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;
create function pg_temp.key(p_name text) returns text language sql as $$ select v from k where name = p_name $$;
grant execute on function pg_temp.key(text) to authenticated;
create function pg_temp.today() returns date language sql as $$ select public.entry_local_date(public.now_ms()) $$;
grant execute on function pg_temp.today() to authenticated;

select ok(not has_function_privilege('anon', 'public.receive_money(bigint, text, uuid, text, date, jsonb)', 'execute'), 'anon cannot execute receive_money');
select ok(has_function_privilege('authenticated', 'public.receive_money(bigint, text, uuid, text, date, jsonb)', 'execute'), 'authenticated can execute receive_money');
select ok(not has_function_privilege('anon', 'public.set_no_spend(date, boolean)', 'execute'), 'anon cannot execute set_no_spend');
select ok(not has_function_privilege('anon', 'public.set_view_mode(text)', 'execute'), 'anon cannot execute set_view_mode');
select ok(not has_function_privilege('anon', 'public.set_spend_until(date)', 'execute'), 'anon cannot execute set_spend_until');
select ok(not has_function_privilege('anon', 'public.set_keep_bucket(uuid)', 'execute'), 'anon cannot execute set_keep_bucket');
select ok((select relrowsecurity from pg_class where oid = 'public.day_checkins'::regclass), 'day_checkins has RLS enabled');
select ok(not has_table_privilege('anon', 'public.day_checkins', 'select'), 'anon cannot read day_checkins');
select ok(not has_table_privilege('authenticated', 'public.day_checkins', 'delete'), 'nobody hard-deletes day_checkins');

set local role authenticated;
select pg_temp.as_a();

-- ---------------------------------------------------------------- defaults and setters
select is((select "viewMode" from public.user_profiles where user_id = auth.uid()), 'full', 'view mode defaults to full');
select is((select "spendUntil" from public.user_profiles where user_id = auth.uid()), null, 'spendUntil defaults to null');
select is((select "keepBucketId" from public.user_profiles where user_id = auth.uid()), null, 'keepBucketId defaults to null');

select lives_ok($$select public.set_view_mode('simple')$$, 'set_view_mode simple');
select is((select "viewMode" from public.user_profiles where user_id = auth.uid()), 'simple', 'view mode is simple');
select lives_ok($$select public.set_view_mode('full')$$, 'set_view_mode full');
select throws_ok($$select public.set_view_mode('fancy')$$, '22023', null, 'an unknown view mode is refused');
select throws_ok($$select public.set_view_mode(null)$$, '22023', null, 'a null view mode is refused');
select is((select "viewMode" from public.user_profiles where user_id = auth.uid()), 'full', 'a refused call changes nothing');

select lives_ok($$select public.set_spend_until('2027-01-15')$$, 'set_spend_until a date');
select is((select "spendUntil" from public.user_profiles where user_id = auth.uid()), '2027-01-15'::date, 'spendUntil stored');
select lives_ok($$select public.set_spend_until(null)$$, 'set_spend_until null clears');
select is((select "spendUntil" from public.user_profiles where user_id = auth.uid()), null, 'spendUntil cleared');

select lives_ok($$select public.set_keep_bucket('b1000000-0000-0000-0000-000000000002')$$, 'set_keep_bucket to Emergency');
select is((select "keepBucketId" from public.user_profiles where user_id = auth.uid()), 'b1000000-0000-0000-0000-000000000002'::uuid, 'keepBucketId stored');
select throws_ok($$select public.set_keep_bucket('b2000000-0000-0000-0000-000000000001')$$, '42501', null, 'another user''s bucket is refused');
select throws_ok($$select public.set_keep_bucket('b1000000-0000-0000-0000-000000000001')$$, '22023', null, 'a Spend bucket cannot be the keep bucket');
select throws_ok($$select public.set_keep_bucket('b1000000-0000-0000-0000-000000000004')$$, '42501', null, 'an archived bucket is refused');
select is((select "keepBucketId" from public.user_profiles where user_id = auth.uid()), 'b1000000-0000-0000-0000-000000000002'::uuid, 'refused calls leave the keep bucket alone');

-- ---------------------------------------------------------------- receive_money: single account
insert into k select 'e1', public.receive_money(1000000, 'acc-bank', 'd1000000-0000-0000-0000-000000000001', '  Allowance week 1 ', pg_temp.today(),
  '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1000000}]'::jsonb);
select matches(pg_temp.key('e1'), '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', 'returns the ledger entry id (a v4 uuid)');
select is((select jsonb_build_object('acc', "accountId", 'amt', "amountMinor", 'dir', direction, 'origin', origin, 'note', note, 'sync', "syncStatus", 'del', "deletedAt")
             from public.ledger_entries where id = pg_temp.key('e1')),
  '{"acc":"acc-bank","amt":1000000,"dir":0,"origin":0,"note":"Allowance week 1","sync":2,"del":null}'::jsonb, 'the inflow is a mobile-shaped income row, name trimmed into the note');
select ok((select "categoryId" is not null from public.ledger_entries where id = pg_temp.key('e1')), 'the inflow has an income category');
select is((select c."categoryType"::int from public.categories c join public.ledger_entries le on le."categoryId" = c.id where le.id = pg_temp.key('e1')), 0, 'and it is an income category');
select is((select jsonb_build_object('src', "sourceId", 'job', job) from public.income_meta where "ledgerEntryId" = pg_temp.key('e1')),
  '{"src":"d1000000-0000-0000-0000-000000000001","job":"manual"}'::jsonb, 'income_meta: the chosen source, job manual');
select is((select count(*)::int from public.allocations where "ledgerEntryId" = pg_temp.key('e1')), 1, 'one allocation line');
select is((select jsonb_build_object('b', "bucketId", 'amt', "amountMinor", 'dest', "destAccountId", 'plan', "planKey", 'bp', "percentBp", 'rule', "ruleTrace" ->> 'rule', 'cy', "transferCycleId" is not null)
             from public.allocations where "ledgerEntryId" = pg_temp.key('e1')),
  '{"b":"b1000000-0000-0000-0000-000000000001","amt":1000000,"dest":"acc-bank","plan":null,"bp":null,"rule":"manual","cy":true}'::jsonb, 'the line snapshots bucket, account and the manual rule');
select is((select "left_minor" from public.bucket_left() where bucket_id = 'b1000000-0000-0000-0000-000000000001'), 1000000::bigint, 'Living has the whole amount left');
select is((select count(*)::int from public.engine_waiting_income(auth.uid())), 0, 'the income is not waiting for a job');
select is((select count(*)::int from public.transfer_plan() where kind = 'transfer'), 0, 'everything stayed where it landed: nothing to move');
select ok((select "closedAt" is not null from public.transfer_cycles where id = (select "transferCycleId" from public.allocations where "ledgerEntryId" = pg_temp.key('e1'))), 'a cycle with nothing to send closes at once');

-- ---------------------------------------------------------------- receive_money: split across three accounts incl. a keep line
insert into k select 'e2', public.receive_money(500000, 'acc-bank', null, null, pg_temp.today(), '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-cash","amountMinor":200000},
  {"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-gc","amountMinor":100000},
  {"bucketId":"b1000000-0000-0000-0000-000000000002","destAccountId":"acc-bank","amountMinor":200000}]'::jsonb);
select is((select count(*)::int from public.allocations where "ledgerEntryId" = pg_temp.key('e2')), 3, 'three allocation lines: one bucket in two accounts, plus keep');
select is((select sum("amountMinor")::bigint from public.allocations where "ledgerEntryId" = pg_temp.key('e2')), 500000::bigint, 'the lines add up to what was received');
select is((select string_agg(b.name || '>' || a."destAccountId" || '=' || a."amountMinor", ',' order by b."displayOrder", a."destAccountId")
             from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = pg_temp.key('e2')),
  'Living>acc-cash=200000,Living>acc-gc=100000,Emergency>acc-bank=200000', 'bucket and destination per line');
select is((select s.name from public.income_meta im join public.income_sources s on s.id = im."sourceId" where im."ledgerEntryId" = pg_temp.key('e2')), 'Others', 'no source given: the Others source');
select is((select count(*)::int from public.income_sources where name = 'Others' and "deletedAt" is null), 1, 'Others was created once');
select is((select note from public.ledger_entries where id = pg_temp.key('e2')), null, 'no name: no note');
select is((select string_agg(from_account_id || '>' || to_account_id || '=' || amount || ':' || done::text, ',' order by from_account_id, to_account_id) from public.transfer_plan() where kind = 'transfer'),
  'acc-bank>acc-cash=200000:false,acc-bank>acc-gc=100000:false', 'the lines appear in transfer_plan as moves from the landed account');
select is((select amount from public.transfer_plan() where kind = 'keep' and from_account_id = 'acc-bank'), 200000::bigint, 'the keep line stays in the landed account');
select is((select "left_minor" from public.bucket_left() where bucket_id = 'b1000000-0000-0000-0000-000000000001'), 1300000::bigint, 'Living left: both receipts');
select is((select "left_minor" from public.bucket_left() where bucket_id = 'b1000000-0000-0000-0000-000000000002'), 200000::bigint, 'Emergency left: the keep line');
select is((select string_agg(account_id || '=' || allocated_here, ',' order by account_id) from public.account_should_hold() where allocated_here > 0),
  'acc-bank=1200000,acc-cash=200000,acc-gc=100000', 'account_should_hold counts each line at its destination');
select lives_ok($$select public.tick_transfer('acc-bank', 'acc-cash', 200000)$$, 'the existing tick works on a manual line');
select lives_ok($$select public.tick_transfer('acc-bank', 'acc-gc', 100000)$$, 'and on the other one');

-- ---------------------------------------------------------------- receive_money: a second receipt in an open cycle, an earlier date, duplicate lines
insert into k select 'e3', public.receive_money(300000, 'acc-gc', 'd1000000-0000-0000-0000-000000000001', 'Back-dated', pg_temp.today() - 2, '[
  {"bucketId":"b1000000-0000-0000-0000-000000000003","destAccountId":"acc-gc","amountMinor":100000},
  {"bucketId":"b1000000-0000-0000-0000-000000000003","destAccountId":"acc-gc","amountMinor":50000},
  {"bucketId":"b1000000-0000-0000-0000-000000000003","destAccountId":"acc-cash","amountMinor":150000}]'::jsonb);
select is((select count(*)::int from public.allocations where "ledgerEntryId" = pg_temp.key('e3')), 2, 'lines for the same bucket and account merge into one row');
select is((select "amountMinor" from public.allocations where "ledgerEntryId" = pg_temp.key('e3') and "destAccountId" = 'acc-gc'), 150000::bigint, 'merged amount');
select is((select public.entry_local_date("occurredAt") from public.ledger_entries where id = pg_temp.key('e3')), pg_temp.today() - 2, 'an earlier date lands on that date');
select is((select ("occurredAt" - (extract(epoch from (public.entry_local_date("occurredAt")::timestamp + interval '12 hours') at time zone 'Asia/Manila') * 1000)::bigint) from public.ledger_entries where id = pg_temp.key('e3')), 0::bigint, 'at 12:00 Manila, as Add income does');
select is((select string_agg(from_account_id || '>' || to_account_id || '=' || amount, ',') from public.transfer_plan() where kind = 'transfer' and not done), 'acc-gc>acc-cash=150000', 'the open-cycle move is a manual line too');

-- ---------------------------------------------------------------- refusals (and nothing is written)
create function pg_temp.entries() returns int language sql as $$ select count(*)::int from public.ledger_entries $$;
grant execute on function pg_temp.entries() to authenticated;
create function pg_temp.allocs() returns int language sql as $$ select count(*)::int from public.allocations $$;
grant execute on function pg_temp.allocs() to authenticated;
insert into k select 'entries', pg_temp.entries()::text;
insert into k select 'allocs', pg_temp.allocs()::text;

select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":999}]')$$,
  '22023', null, 'lines that do not add up to the amount are refused (short)');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1001}]')$$,
  '22023', null, 'and over');
select throws_ok($$select public.receive_money(0, 'acc-bank', null, null, pg_temp.today(), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1}]')$$,
  '22023', null, 'a zero amount is refused');
select throws_ok($$select public.receive_money(-5, 'acc-bank', null, null, pg_temp.today(), '[]')$$, '22023', null, 'a negative amount is refused');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(), '[]')$$, '22023', null, 'no lines is refused');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(), 'null')$$, '22023', null, 'null lines is refused');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(),
  '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1500},{"bucketId":"b1000000-0000-0000-0000-000000000002","destAccountId":"acc-bank","amountMinor":-500}]')$$,
  '22023', null, 'a negative line is refused even when the total matches');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(),
  '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1000},{"bucketId":"b1000000-0000-0000-0000-000000000002","destAccountId":"acc-bank","amountMinor":0}]')$$,
  '22023', null, 'a zero line is refused');
select throws_ok($$select public.receive_money(1000, 'acc-b', null, null, pg_temp.today(), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1000}]')$$,
  '42501', null, 'receiving into another user''s account is refused');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-b","amountMinor":1000}]')$$,
  '42501', null, 'a line into another user''s account is refused');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(), '[{"bucketId":"b2000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1000}]')$$,
  '42501', null, 'another user''s bucket is refused');
select throws_ok($$select public.receive_money(1000, 'acc-bank', 'd2000000-0000-0000-0000-000000000001', null, pg_temp.today(), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1000}]')$$,
  '42501', null, 'another user''s source is refused');
select throws_ok($$select public.receive_money(1000, 'acc-old', null, null, pg_temp.today(), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1000}]')$$,
  '22023', null, 'an archived received-in account is refused');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-aud","amountMinor":1000}]')$$,
  '22023', null, 'a non-peso destination is refused');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today(), '[{"bucketId":"b1000000-0000-0000-0000-000000000004","destAccountId":"acc-bank","amountMinor":1000}]')$$,
  '22023', null, 'an archived bucket is refused');
select throws_ok($$select public.receive_money(1000, 'acc-bank', null, null, pg_temp.today() + 1, '[{"bucketId":"b1000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":1000}]')$$,
  '22023', null, 'a future date is refused');
select is(pg_temp.entries()::text, pg_temp.key('entries'), 'refused calls wrote no ledger entries');
select is(pg_temp.allocs()::text, pg_temp.key('allocs'), 'and no allocations');

-- ---------------------------------------------------------------- the widened unique index
select is((select count(*)::int from pg_indexes where indexname = 'allocations_entry_bucket_active_uq'), 0, 'the old (entry, bucket) unique index is gone');
select is((select count(*)::int from pg_indexes where indexname = 'allocations_entry_bucket_dest_active_uq'), 1, 'the (entry, bucket, destination) one replaces it');

-- ---------------------------------------------------------------- no-spend check-ins
select lives_ok($$select public.set_no_spend(pg_temp.today(), true)$$, 'mark today no-spend');
select lives_ok($$select public.set_no_spend(pg_temp.today(), true)$$, 'marking twice is a no-op');
select is((select count(*)::int from public.day_checkins where day = pg_temp.today() and "deletedAt" is null), 1, 'one live row');
select lives_ok($$select public.set_no_spend(pg_temp.today() - 14, true)$$, '14 days back is allowed');
select throws_ok($$select public.set_no_spend(pg_temp.today() - 15, true)$$, '22023', null, '15 days back is refused');
select throws_ok($$select public.set_no_spend(pg_temp.today() + 1, true)$$, '22023', null, 'tomorrow is refused');
select lives_ok($$select public.set_no_spend(pg_temp.today(), false)$$, 'unmark today');
select is((select count(*)::int from public.day_checkins where day = pg_temp.today() and "deletedAt" is null), 0, 'no live row');
select is((select count(*)::int from public.day_checkins where day = pg_temp.today() and "deletedAt" is not null), 1, 'it was soft deleted, not removed');
select lives_ok($$select public.set_no_spend(pg_temp.today(), true)$$, 'mark again after unmarking');
select is((select count(*)::int from public.day_checkins where day = pg_temp.today()), 2, 'a new live row beside the soft-deleted one');

-- ---------------------------------------------------------------- day_checkins RLS: user B cannot see or touch A's rows
select pg_temp.as_b();
select is((select count(*)::int from public.day_checkins), 0, 'B sees none of A''s check-ins');
select throws_ok($$insert into public.day_checkins (user_id, day, kind) values ('aaaaaaaa-0000-0000-0000-000000000001', pg_temp.today(), 'no_spend')$$,
  '42501', null, 'B cannot insert a row for A');
create function pg_temp.try_update() returns int language plpgsql as $f$
declare n int; begin update public.day_checkins set "deletedAt" = 1; get diagnostics n = row_count; return n; end $f$;
grant execute on function pg_temp.try_update() to authenticated;
select is(pg_temp.try_update(), 0, 'B cannot update A''s rows');
select lives_ok($$select public.set_no_spend(pg_temp.today(), true)$$, 'B can mark their own day');
select is((select count(*)::int from public.day_checkins), 1, 'B sees only their own row');
select is((select user_id from public.day_checkins), 'bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'it is B''s');
select lives_ok($$select public.set_no_spend(pg_temp.today(), false)$$, 'B unmarking touches only B''s rows');
select pg_temp.as_a();
select is((select count(*)::int from public.day_checkins where day = pg_temp.today() and "deletedAt" is null), 1, 'A''s live row for today is untouched');
select is((select "viewMode" from public.user_profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), null, 'A cannot see B''s profile');

select * from finish();
rollback;
