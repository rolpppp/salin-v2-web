-- Ticket 13: Accounts (archive blocked when in use, G12), Categories (move freezes old entries, remove only
-- when unused), Goals (links guarded, Plan B switch kept in step), and cross-user refusals for every function.
begin;
select plan(79);

-- ---- fixture. A: accounts for each "in use" reason; B: an unrelated set.
insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-mari',  'aaaaaaaa-0000-0000-0000-000000000001', 'MariBank',     1,   0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-mp2',   'aaaaaaaa-0000-0000-0000-000000000001', 'Pag-IBIG MP2', 6,   0, 'PHP', 'i', 2, false, 1, 1, 2),
  ('acc-tonik', 'aaaaaaaa-0000-0000-0000-000000000001', 'Tonik',        2,   0, 'PHP', 'i', 3, false, 1, 1, 2),
  ('acc-free',  'aaaaaaaa-0000-0000-0000-000000000001', 'Old wallet',   3,   0, 'PHP', 'i', 4, false, 1, 1, 2),
  ('acc-money', 'aaaaaaaa-0000-0000-0000-000000000001', 'Piggy',        0, 500, 'PHP', 'i', 5, false, 1, 1, 2),
  ('acc-src',   'aaaaaaaa-0000-0000-0000-000000000001', 'Source home',  1,   0, 'PHP', 'i', 6, false, 1, 1, 2),
  ('acc-wait',  'aaaaaaaa-0000-0000-0000-000000000001', 'Waiting home', 1,   0, 'PHP', 'i', 7, false, 1, 1, 2),
  ('acc-dup',   'aaaaaaaa-0000-0000-0000-000000000001', 'MariBank',     1,   0, 'PHP', 'i', 8, true,  1, 1, 2),
  ('acc-b-1',   'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank',       1,   0, 'PHP', 'i', 1, false, 1, 1, 2);

insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder") values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living',      'spend',     'living',    'acc-mari', false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',         'spend',     'fun',       'acc-mari', false, 2),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Buffer',      'set_aside', 'buffer',    'acc-mari', false, 3),
  ('b1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency',   'save',      'emergency', 'acc-mari', false, 4),
  ('b1000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Investments', 'save',      'invest',    'acc-mp2',  false, 5),
  ('b1000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Old bucket',  'save',      'sinking',   'acc-mari', false, 6),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Living',    'spend',     'living',    'acc-b-1',  false, 1);
update public.buckets set "isArchived" = true where id = 'b1000000-0000-0000-0000-000000000006';

insert into public.allocation_plans (id, user_id, key, name) values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A', 'Plan A');
insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000005', 10000);
insert into public.allocation_rules (id, user_id, kind, params) values
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'switch_on_goal',
     '{"fromPlan":"A","toPlan":"B","bucketId":"b1000000-0000-0000-0000-000000000004","targetMinor":5000000}');

-- sources: "Work" (plan job, lands MariBank, income category cat-salary), "Side" lands on acc-src, "Waiting" lands on acc-wait
insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "syncStatus") values
  ('cat-salary', 'aaaaaaaa-0000-0000-0000-000000000001', 'Salary',    'i', 'c', 0, false, 1, 1, 1, 2),
  ('cat-a',      'aaaaaaaa-0000-0000-0000-000000000001', 'Groceries', 'i', 'c', 1, false, 2, 1, 1, 2),
  ('cat-unused', 'aaaaaaaa-0000-0000-0000-000000000001', 'Unused',    'i', 'c', 1, false, 3, 1, 1, 2),
  ('cat-new',    'aaaaaaaa-0000-0000-0000-000000000001', 'Brand new', 'i', 'c', 1, false, 4, 1, 1, 2),
  ('cat-b',      'bbbbbbbb-0000-0000-0000-000000000002', 'B things',  'i', 'c', 1, false, 1, 1, 1, 2);
insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId", "categoryId") values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Work', 'salary', 'plan', 'acc-mari', 'cat-salary'),
  ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Side', 'side_hustle', 'ask', 'acc-src', null),
  ('d1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Waiting', 'gift', 'ask', null, null);

create function pg_temp.ms(d text) returns bigint language sql as $$ select (extract(epoch from (d || ' 12:00:00+08')::timestamptz) * 1000)::bigint $$;
insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('inc-1',    'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari', null, 100000, 0, 0, pg_temp.ms('2026-10-08'), 1, 1, 2),
  ('inc-wait', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-wait', null,   5000, 0, 0, pg_temp.ms('2026-10-09'), 1, 1, 2),
  -- spending logged while cat-a had no mapping at all (no entry_buckets row yet)
  ('sp-early', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari', 'cat-a', 1000, 1, 0, pg_temp.ms('2026-10-01'), 1, 1, 2);
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-1',    'd1000000-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-wait', 'd1000000-0000-0000-0000-000000000003', null);

insert into public.goals (id, user_id, name, "targetMinor", "linkedBucketId", "linkedShareBp", "isPlanSwitch") values
  ('90000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency fund', 5000000, 'b1000000-0000-0000-0000-000000000004', 10000, true),
  ('90000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'PC Build',        8000000, 'b1000000-0000-0000-0000-000000000005', 5000, false);

create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;
create function pg_temp.spent_in(p_bucket uuid) returns bigint language sql as $$
  select spent from public.bucket_left() where bucket_id = p_bucket $$;

set local role authenticated;
select pg_temp.as_a();

-- ================================================================ accounts: reasons
select is(public.account_in_use_reason('acc-free'), null, 'free account: no reason, can be archived');
select is(public.account_in_use_reason('acc-mp2'), 'Investments is kept here', 'reason: a bucket is kept here');
select is(public.account_in_use_reason('acc-src'), 'Side lands here', 'reason: a source lands here');
select is(public.account_in_use_reason('acc-wait'), 'an income that landed here is still waiting for a job', 'reason: waiting income landed here');
select is(public.account_in_use_reason('acc-money'), 'it holds money', 'reason: it holds money (opening balance)');
select is(public.account_in_use_reason('acc-tonik'), null, 'Tonik is free before G12');

-- ================================================================ accounts: archive / restore
select throws_ok($$select public.archive_account('acc-mp2')$$, 'P0001', 'in use: Investments is kept here', 'archive refused while a bucket is kept here');
select throws_ok($$select public.archive_account('acc-money')$$, 'P0001', 'in use: it holds money', 'archive refused while it holds money');
select throws_ok($$select public.archive_account('acc-wait')$$, 'P0001', null, 'archive refused with a waiting income');
select is((select "isArchived" from public.accounts where id = 'acc-mp2'), false, 'refused archive changes nothing');
select lives_ok($$select public.archive_account('acc-free')$$, 'archive allowed when nothing uses the account');
select is((select "isArchived" from public.accounts where id = 'acc-free'), true, 'archived');
select ok((select "updatedAt" from public.accounts where id = 'acc-free') > 1000000000000, 'archive sets updatedAt to server ms');
select lives_ok($$select public.restore_account('acc-free')$$, 'restore');
select is((select "isArchived" from public.accounts where id = 'acc-free'), false, 'restored');
select throws_ok($$select public.restore_account('acc-dup')$$, '23505', null, 'restore refused when another active account has the same name');
select throws_ok($$select public.archive_account('acc-nope')$$, 'P0002', 'account not found', 'unknown account');

-- ================================================================ G12 at SQL level
-- Confirm the income (Plan A = 100% Investments, kept in MP2), tick the transfer, then move "Kept in" to Tonik.
select is((select count(*)::int from public.confirm_incomes(array['inc-1'])), 1, 'confirm the income: one allocation to Investments');
select is(public.account_in_use_reason('acc-mp2'), 'Investments is kept here', 'G12 before: MP2 in use because Investments is kept there');
select lives_ok($$select public.tick_transfer('acc-mari', 'acc-mp2', 100000)$$, 'tick MariBank -> MP2');
reset role;
update public.buckets set "keptInAccountId" = 'acc-tonik' where id = 'b1000000-0000-0000-0000-000000000005';
set local role authenticated;
select pg_temp.as_a();
select is((select should_hold from public.account_should_hold() where account_id = 'acc-mp2'), 100000::bigint, 'G12: MP2 still should hold its earlier share');
select is((select bucket_kept_here from public.account_should_hold() where account_id = 'acc-mp2'), false, 'G12: no bucket is kept in MP2 now');
select is(public.account_in_use_reason('acc-mp2'), 'it holds money', 'G12: MP2 cannot be archived, it still holds the money');
select throws_ok($$select public.archive_account('acc-mp2')$$, 'P0001', 'in use: it holds money', 'G12: archive refused');
select is(public.account_in_use_reason('acc-tonik'), 'Investments is kept here', 'G12: Tonik is now in use');

-- ================================================================ categories: remove
select is(public.category_in_use_reason('cat-unused'), null, 'unused category can be removed');
select is(public.category_in_use_reason('cat-a'), 'it has entries', 'category with entries is in use');
select is(public.category_in_use_reason('cat-salary'), 'Work uses it to recognise income', 'income category used by a source is in use');
select throws_ok($$select public.remove_category('cat-a')$$, 'P0001', 'in use: it has entries', 'remove refused when it has entries');
select throws_ok($$select public.remove_category('cat-salary')$$, 'P0001', null, 'remove refused for a source''s income category');
select is((select "deletedAt" from public.categories where id = 'cat-a'), null, 'refused remove changes nothing');
select lives_ok($$select public.move_category('cat-unused', 'b1000000-0000-0000-0000-000000000002')$$, 'map the unused category to Fun');
select lives_ok($$select public.remove_category('cat-unused')$$, 'remove the unused category');
select ok((select "deletedAt" from public.categories where id = 'cat-unused') is not null, 'removed = soft deleted (deletedAt set)');
select ok((select "deletedAt" from public.category_buckets where "categoryId" = 'cat-unused') is not null, 'its bucket mapping is soft deleted too');
select is((select count(*)::int from public.categories where id = 'cat-unused'), 1, 'the row is still there (never hard deleted)');

-- ================================================================ categories: move + backfill
-- First mapping: map, then backfill, so the early entry (no snapshot yet) lands in the chosen bucket.
select is(public.move_category('cat-a', 'b1000000-0000-0000-0000-000000000001'), 1, 'first mapping backfills the one early entry');
select is(pg_temp.spent_in('b1000000-0000-0000-0000-000000000001'), 1000::bigint, 'Living now counts the early entry');
reset role;
-- new spending in Living via the trigger, plus one entry the trigger never saw (no entry_buckets row), plus an override
insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('sp-2', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari', 'cat-a', 2000, 1, 0, pg_temp.ms('2026-10-05'), 1, 1, 2),
  ('sp-3', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari', 'cat-a', 4000, 1, 0, pg_temp.ms('2026-10-06'), 1, 1, 2),
  ('sp-4', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari', 'cat-a', 8000, 1, 0, pg_temp.ms('2026-10-07'), 1, 1, 2);
delete from public.entry_buckets where "ledgerEntryId" = 'sp-3';
update public.entry_buckets set "bucketId" = 'b1000000-0000-0000-0000-000000000003', source = 'override' where "ledgerEntryId" = 'sp-4';
set local role authenticated;
select pg_temp.as_a();
select is(pg_temp.spent_in('b1000000-0000-0000-0000-000000000001'), 3000::bigint, 'before the move: Living has sp-early + sp-2 (sp-3 not snapshotted, sp-4 overridden to Buffer)');

select is(public.move_category('cat-a', 'b1000000-0000-0000-0000-000000000002'), 1, 'move to Fun: the un-snapshotted entry is frozen first');
select is((select "bucketId" from public.category_buckets where "categoryId" = 'cat-a' and "deletedAt" is null), 'b1000000-0000-0000-0000-000000000002'::uuid, 'mapping now points at Fun');
select is((select source from public.category_buckets where "categoryId" = 'cat-a' and "deletedAt" is null), 'user', 'a move by the user is source = user');
select is(pg_temp.spent_in('b1000000-0000-0000-0000-000000000001'), 7000::bigint, 'after the move: old entries (incl. the frozen sp-3) stay in Living');
select is(pg_temp.spent_in('b1000000-0000-0000-0000-000000000002'), 0::bigint, 'Fun has nothing from before the move');
select is(pg_temp.spent_in('b1000000-0000-0000-0000-000000000003'), 8000::bigint, 'an override stays where it was put');
insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('sp-new', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-mari', 'cat-a', 500, 1, 0, pg_temp.ms('2026-10-10'), 1, 1, 2);
select is(pg_temp.spent_in('b1000000-0000-0000-0000-000000000002'), 500::bigint, 'new spending goes to Fun');
select is(public.move_category('cat-a', 'b1000000-0000-0000-0000-000000000002'), 0, 'moving to the same bucket does nothing');
select throws_ok($$select public.move_category('cat-a', 'b1000000-0000-0000-0000-000000000006')$$, 'P0002', 'bucket not found', 'cannot move into an archived bucket');
select throws_ok($$select public.move_category('cat-salary', 'b1000000-0000-0000-0000-000000000002')$$, 'P0002', 'category not found', 'income categories are not moved between buckets');

-- ================================================================ goals
select is(public.add_goal('Trip', 3000000, 'b1000000-0000-0000-0000-000000000002', 2500) is not null, true, 'add a goal linked to 25% of Fun');
select throws_ok($$select public.add_goal('trip ', 1, null, 10000)$$, '23505', null, 'duplicate goal name (case and space insensitive)');
select throws_ok($$select public.add_goal('Zero', 0, null, 10000)$$, 'P0001', null, 'target must be more than 0');
select throws_ok($$select public.add_goal('Bad share', 100, null, 10001)$$, 'P0001', null, 'share over 100 percent refused');
select lives_ok($$select public.update_goal('90000000-0000-0000-0000-000000000001', 'Emergency fund', 6000000, 'b1000000-0000-0000-0000-000000000004', 10000)$$, 'retarget the Emergency goal');
select is((select (params ->> 'targetMinor')::bigint from public.allocation_rules where kind = 'switch_on_goal'), 6000000::bigint, 'the Plan B switch amount follows the Emergency target');
select lives_ok($$select public.update_goal('90000000-0000-0000-0000-000000000002', 'PC Build', 9000000, 'b1000000-0000-0000-0000-000000000005', 5000)$$, 'retarget another goal');
select is((select (params ->> 'targetMinor')::bigint from public.allocation_rules where kind = 'switch_on_goal'), 6000000::bigint, 'a non-switch goal does not touch the rule');
select throws_ok($$select public.archive_goal('90000000-0000-0000-0000-000000000001')$$, 'P0001', 'in use: it is your Plan B switch', 'the Plan B switch goal cannot be archived');
select lives_ok($$select public.archive_goal('90000000-0000-0000-0000-000000000002')$$, 'archive PC Build');
select lives_ok($$select public.restore_goal('90000000-0000-0000-0000-000000000002')$$, 'restore PC Build');

-- ================================================================ list helpers for the screens
select is((select count(*)::int from public.accounts_in_use()), 7, 'accounts_in_use lists the 7 active accounts (archived excluded)');
select is((select reason from public.accounts_in_use() where account_id = 'acc-money'), 'it holds money', 'accounts_in_use carries each reason');
select is((select reason from public.accounts_in_use() where account_id = 'acc-free'), null, 'accounts_in_use: free account has no reason');
select is((select reason from public.categories_in_use() where category_id = 'cat-a'), 'it has entries', 'categories_in_use: category with entries');
select is((select count(*)::int from public.categories_in_use() where category_id in ('cat-unused', 'cat-salary')), 0, 'categories_in_use: removed and income categories are not listed');
select is((select jsonb_object_agg(bucket_id::text, total_minor) from public.category_month_spend(pg_temp.ms('2026-10-01') - 43200000, pg_temp.ms('2026-11-01'), 'PHP')),
  '{"b1000000-0000-0000-0000-000000000001": 7000, "b1000000-0000-0000-0000-000000000002": 500, "b1000000-0000-0000-0000-000000000003": 8000}'::jsonb,
  'category_month_spend groups by the snapshotted bucket, not the category''s current one');
select is((select entries from public.category_month_spend(pg_temp.ms('2026-10-01') - 43200000, pg_temp.ms('2026-11-01')) where bucket_id = 'b1000000-0000-0000-0000-000000000001'), 3, 'category_month_spend counts entries');

-- ================================================================ cross-user: B can't use A's ids anywhere
select pg_temp.as_b();
select throws_ok($$select * from public.accounts_in_use('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'B: accounts_in_use(A) refused');
select is((select count(*)::int from public.category_month_spend(0, 9999999999999)), 0, 'B: sees none of A''s spending');
select throws_ok($$select public.account_in_use_reason('acc-free')$$, 'P0002', null, 'B: reason for A''s account');
select throws_ok($$select public.archive_account('acc-free')$$, 'P0002', null, 'B: archive A''s account');
select throws_ok($$select public.restore_account('acc-dup')$$, 'P0002', null, 'B: restore A''s account');
select throws_ok($$select public.remove_category('cat-unused')$$, 'P0002', null, 'B: remove A''s category');
select throws_ok($$select public.move_category('cat-a', 'b2000000-0000-0000-0000-000000000001')$$, 'P0002', null, 'B: move A''s category');
select throws_ok($$select public.move_category('cat-b', 'b1000000-0000-0000-0000-000000000001')$$, 'P0002', 'bucket not found', 'B: move own category into A''s bucket');
select throws_ok($$select public.add_goal('Sneaky', 100, 'b1000000-0000-0000-0000-000000000001', 10000)$$, 'P0002', 'bucket not found', 'B: link a goal to A''s bucket');
select throws_ok($$select public.update_goal('90000000-0000-0000-0000-000000000002', 'Mine now', 1, null, 10000)$$, 'P0002', null, 'B: update A''s goal');
select throws_ok($$select public.archive_goal('90000000-0000-0000-0000-000000000002')$$, 'P0002', null, 'B: archive A''s goal');
select is((select "targetMinor" from public.goals where id = '90000000-0000-0000-0000-000000000002'), null, 'B cannot even see A''s goals');

select * from finish();
rollback;
