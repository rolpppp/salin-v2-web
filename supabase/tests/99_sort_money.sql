-- Sort the money you already have (ticket 34): unsorted_money, sort_money, and "should be here" ignoring sorting covers.
-- The scenario is the owner's: ₱7,500 lands in GCash while just tracking and is sent on to Maya, the bank and Cash,
-- all as Spending. A plan then keeps Fun in Maya and Emergency + Investments in the bank.
begin;
select plan(40);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-gc',   'aaaaaaaa-0000-0000-0000-000000000001', 'GCash',    3, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-maya', 'aaaaaaaa-0000-0000-0000-000000000001', 'Maya',     3, 0, 'PHP', 'i', 2, false, 1, 1, 2),
  ('acc-bank', 'aaaaaaaa-0000-0000-0000-000000000001', 'MariBank', 1, 0, 'PHP', 'i', 3, false, 1, 1, 2),
  ('acc-cash', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cash',     0, 0, 'PHP', 'i', 4, false, 1, 1, 2),
  ('acc-b',    'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank',   1, 0, 'PHP', 'i', 1, false, 1, 1, 2);

-- s1 Living (GCash), s2 Fun (Maya), s3 Emergency (bank), s4 Investments (bank), s5 Buffer (GCash), s6 archived (bank)
insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder", "isArchived") values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living',      'spend',     'living',    'acc-gc',   false, 1, false),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun money',   'spend',     'fun',       'acc-maya', false, 2, false),
  ('51000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency',   'save',      'emergency', 'acc-bank', false, 3, false),
  ('51000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Investments', 'save',      'invest',    'acc-bank', false, 4, false),
  ('51000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Buffer',      'set_aside', 'buffer',    'acc-gc',   false, 5, false),
  ('51000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Old',         'save',      null,        'acc-bank', false, 6, true),
  ('52000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Living',    'spend',     'living',    'acc-b',    false, 1, false);

insert into public.user_profiles (user_id, "firstName", "onboardedAt") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Ben', 1);
insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Allowance', 'allowance', 'ask', 'acc-gc');

create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;
create function pg_temp.hold(p_acct text) returns bigint language sql as $$
  select should_hold from public.account_should_hold() where account_id = p_acct $$;
create function pg_temp.left_of(p_bucket text) returns bigint language sql as $$
  select left_minor from public.bucket_left() where bucket_id = p_bucket::uuid $$;
grant execute on function pg_temp.hold(text) to authenticated;
grant execute on function pg_temp.left_of(text) to authenticated;

select has_column('public', 'bucket_covers', 'atAccountId', 'bucket_covers has atAccountId');
select ok(not has_function_privilege('anon', 'public.sort_money(jsonb)', 'execute'), 'anon cannot execute sort_money');
select ok(has_function_privilege('authenticated', 'public.sort_money(jsonb)', 'execute'), 'authenticated can execute sort_money');
select ok(not has_function_privilege('anon', 'public.unsorted_money(uuid)', 'execute'), 'anon cannot execute unsorted_money');

set local role authenticated;
select pg_temp.as_a();

-- ₱7,500 into GCash, all Spending, sent on: ₱1,200 to Maya, ₱5,000 to the bank, ₱1,300 to Cash.
select lives_ok($$select public.receive_money(750000, 'acc-gc', 'd1000000-0000-0000-0000-000000000001', 'Allowance', public.entry_local_date(public.now_ms()),
  '[{"bucketId":"51000000-0000-0000-0000-000000000001","destAccountId":"acc-maya","amountMinor":120000},
    {"bucketId":"51000000-0000-0000-0000-000000000001","destAccountId":"acc-bank","amountMinor":500000},
    {"bucketId":"51000000-0000-0000-0000-000000000001","destAccountId":"acc-cash","amountMinor":130000}]'::jsonb)$$, 'first money: all Spending, sent to three accounts');

-- ---------------------------------------------------------------- before sorting
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000001'), 750000::bigint, 'before: Living holds all ₱7,500');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000002'), 0::bigint, 'before: Fun holds nothing');
select results_eq($$select bucket_id::text, account_id, amount_minor from public.unsorted_money() order by account_id$$,
  $$values ('51000000-0000-0000-0000-000000000001', 'acc-bank', 500000::bigint), ('51000000-0000-0000-0000-000000000001', 'acc-maya', 120000::bigint)$$,
  'unsorted: Living at the bank and at Maya; Cash keeps no bucket, so it is not offered');
select is(pg_temp.hold('acc-maya'), 120000::bigint, 'before: Maya should hold ₱1,200');
select is(pg_temp.hold('acc-bank'), 500000::bigint, 'before: the bank should hold ₱5,000');
select is(pg_temp.hold('acc-gc'), 0::bigint, 'before: GCash should hold nothing (all sent on)');
select is(pg_temp.hold('acc-cash'), 130000::bigint, 'before: Cash should hold ₱1,300');

-- ---------------------------------------------------------------- refusals (nothing written)
select throws_ok($$select public.sort_money('[]'::jsonb)$$, '22023', null, 'an empty list is refused');
select throws_ok($$select public.sort_money(null)$$, '22023', null, 'null is refused');
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000002","account":"acc-maya"}]'::jsonb)$$,
  '22023', null, 'a line without an amount is refused');
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000002","account":"acc-maya","amount":12.5}]'::jsonb)$$,
  '22023', null, 'a fractional amount is refused');
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000002","account":"acc-maya","amount":0}]'::jsonb)$$,
  '22023', null, 'a zero amount is refused');
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000001","account":"acc-gc","amount":100}]'::jsonb)$$,
  '22023', null, 'sorting a bucket into itself is refused');
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000002","account":"acc-bank","amount":100}]'::jsonb)$$,
  'P0001', 'That bucket is not kept in that account.', 'the target must live in the account the money is in');
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000006","account":"acc-bank","amount":100}]'::jsonb)$$,
  'P0001', 'That bucket is not kept in that account.', 'an archived bucket is not a target');
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000002","account":"acc-maya","amount":120001}]'::jsonb)$$,
  'P0001', 'Only 120000 centavos there are still unsorted.', 'cannot sort more than is unsorted in that account');
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000003","account":"acc-bank","amount":300000},
                                              {"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000004","account":"acc-bank","amount":300000}]'::jsonb)$$,
  'P0001', 'Only 500000 centavos there are still unsorted.', 'lines for the same account add up against what is unsorted');
select is((select count(*)::int from public.bucket_covers), 0, 'refused calls wrote nothing');

-- Spending most of Living first caps what can be sorted: an ordinary cover moves ₱7,000 to Buffer.
select lives_ok($$select public.cover_bucket('51000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000005', 700000)$$, 'Living lends ₱7,000 to Buffer');
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000002","account":"acc-maya","amount":120000}]'::jsonb)$$,
  'P0001', 'Only 50000 centavos are left in that bucket.', 'cannot sort more than the bucket has left');
reset role;
delete from public.bucket_covers;
set local role authenticated;
select pg_temp.as_a();

-- Another user can't touch Ana's buckets.
select pg_temp.as_b();
select throws_ok($$select public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000002","account":"acc-maya","amount":100}]'::jsonb)$$,
  'P0002', null, 'another user''s buckets are not found');
select is((select count(*)::int from public.unsorted_money()), 0, 'Ben has nothing unsorted');
select pg_temp.as_a();

-- ---------------------------------------------------------------- sorting
select is(public.sort_money('[{"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000002","account":"acc-maya","amount":120000},
                              {"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000003","account":"acc-bank","amount":400000},
                              {"from":"51000000-0000-0000-0000-000000000001","to":"51000000-0000-0000-0000-000000000004","account":"acc-bank","amount":100000}]'::jsonb),
  3, 'sort_money writes one cover per line');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000001'), 130000::bigint, 'after: Living keeps the ₱1,300 in Cash');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000002'), 120000::bigint, 'after: Fun holds ₱1,200');
select is(pg_temp.left_of('51000000-0000-0000-0000-000000000003') + pg_temp.left_of('51000000-0000-0000-0000-000000000004'), 500000::bigint,
  'after: Emergency + Investments hold ₱5,000');
select is((select sum(left_minor)::bigint from public.bucket_left()), 750000::bigint, 'the total across buckets is unchanged');
select is(pg_temp.hold('acc-maya'), 120000::bigint, 'after: Maya should still hold ₱1,200 (nothing moved between accounts)');
select is(pg_temp.hold('acc-bank'), 500000::bigint, 'after: the bank should still hold ₱5,000');
select is(pg_temp.hold('acc-gc'), 0::bigint, 'after: GCash should still hold nothing');
select is(pg_temp.hold('acc-cash'), 130000::bigint, 'after: Cash should still hold ₱1,300');
select is((select count(*)::int from public.unsorted_money()), 0, 'nothing is left unsorted');
select is((select covers_in_minor from public.week_bucket_flows(0, public.now_ms() + 1) where bucket_id = '51000000-0000-0000-0000-000000000002'), 0::bigint,
  'Review: sorting into Fun is not a cover');
select is((select covers_out_minor from public.week_bucket_flows(0, public.now_ms() + 1) where bucket_id = '51000000-0000-0000-0000-000000000001'), 0::bigint,
  'Review: sorting out of Living is not a cover');
select is((select change_minor from public.week_bucket_flows(0, public.now_ms() + 1) where bucket_id = '51000000-0000-0000-0000-000000000002'), 120000::bigint,
  'Review: Fun still shows the ₱1,200 it gained');

select * from finish();
rollback;
