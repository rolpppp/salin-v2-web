-- Ticket 19: Log spending (SPEC 8, BR 11). A spending entry written the way the web does it (a full mobile-shaped
-- outflow row, origin manual, as the signed-in user) gets its entry_buckets row from the category's CURRENT bucket;
-- a later category move never re-buckets it; and user B cannot see or use user A's accounts/categories.
begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-a-cash', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cash',   0, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-b-cash', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Cash', 0, 0, 'PHP', 'i', 1, false, 1, 1, 2);

insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder") values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living', 'spend', 'living', 'acc-a-cash', false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',    'spend', 'fun',    'acc-a-cash', false, 2),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Living', 'spend', 'living', 'acc-b-cash', false, 1);

insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "syncStatus") values
  ('cat-a-lunch', 'aaaaaaaa-0000-0000-0000-000000000001', 'Lunch',   'i', 'c', 1, false, 1, 1, 1, 2),
  ('cat-a-bare',  'aaaaaaaa-0000-0000-0000-000000000001', 'Unmapped', 'i', 'c', 1, false, 2, 1, 1, 2),
  ('cat-b-food',  'bbbbbbbb-0000-0000-0000-000000000002', 'B Food', 'i', 'c', 1, false, 1, 1, 1, 2);
insert into public.category_buckets (user_id, "categoryId", "bucketId", source) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cat-a-lunch', 'b1000000-0000-0000-0000-000000000001', 'auto'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'cat-b-food',  'b2000000-0000-0000-0000-000000000001', 'auto');

-- the exact column set of newSpendingEntryRow (lib/domain/mobile/builders.ts)
create function pg_temp.web_log(p_id text, p_account text, p_category text, p_amount bigint) returns void language sql as $$
  insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "recurringInstanceId", "debtId", "splitId", "transferId",
    "amountMinor", direction, origin, "occurredAt", note, "metadataJson", "createdAt", "updatedAt", "deletedAt", "syncStatus")
  values (p_id, auth.uid(), p_account, p_category, null, null, null, null, p_amount, 1, 0, 1791700000000, 'Lunch with team', null, 1791700000000, 1791700000000, null, 2)
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok($$select pg_temp.web_log('web-sp1', 'acc-a-cash', 'cat-a-lunch', 18000)$$, 'A logs ₱180.00 for Lunch the way the web does');
select is((select "bucketId"::text || '|' || source from public.entry_buckets where "ledgerEntryId" = 'web-sp1'), 'b1000000-0000-0000-0000-000000000001|category',
  'the entry_buckets trigger stored the category''s bucket (Living), source category');
select is((select left_minor from public.bucket_left() where bucket_id = 'b1000000-0000-0000-0000-000000000001'), -18000::bigint, 'bucket_left counts it: Living left = -₱180.00 (no allocations in this fixture)');
select is((select spent from public.bucket_left() where bucket_id = 'b1000000-0000-0000-0000-000000000002'), 0::bigint, 'Fun is untouched');

-- a category with no bucket yet: the row is valid (it syncs) but has no snapshot; the web never offers such a category
select lives_ok($$select pg_temp.web_log('web-sp2', 'acc-a-cash', 'cat-a-bare', 500)$$, 'an unmapped category still inserts');
select is((select count(*)::int from public.entry_buckets where "ledgerEntryId" = 'web-sp2'), 0, 'and gets no entry_buckets row');

-- history is never rewritten: moving the category later leaves the old entry in Living
select lives_ok($$select public.move_category('cat-a-lunch', 'b1000000-0000-0000-0000-000000000002')$$, 'A moves Lunch to Fun');
select is((select "bucketId"::text from public.entry_buckets where "ledgerEntryId" = 'web-sp1'), 'b1000000-0000-0000-0000-000000000001', 'the earlier entry stays in Living');
select lives_ok($$select pg_temp.web_log('web-sp3', 'acc-a-cash', 'cat-a-lunch', 2000)$$, 'a new Lunch entry after the move');
select is((select "bucketId"::text from public.entry_buckets where "ledgerEntryId" = 'web-sp3'), 'b1000000-0000-0000-0000-000000000002', 'it lands in Fun, the category''s current bucket');

-- user B
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.accounts where id = 'acc-a-cash'), 0, 'B cannot read A''s account (the action''s ownership check finds nothing)');
select is((select count(*)::int from public.categories where id = 'cat-a-lunch'), 0, 'B cannot read A''s category');
select is((select count(*)::int from public.ledger_entries where id = 'web-sp1'), 0, 'B cannot read A''s entry');
select throws_ok($$insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus")
  values ('evil-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-a-cash', 'cat-a-lunch', 1, 1, 0, 1, 1, 1, 2)$$, '42501', null, 'B cannot write an entry as A');
-- the FKs do not guard ownership, so a forged row with A's ids under B's own user_id inserts (the action re-checks before writing)...
select lives_ok($$select pg_temp.web_log('forged-1', 'acc-a-cash', 'cat-a-lunch', 100)$$, 'the database alone accepts B''s row pointing at A''s ids (hence the server-side ownership check)');
-- ...but the trigger only maps through B's own category_buckets, so nothing of A's buckets leaks
select is((select count(*)::int from public.entry_buckets where "ledgerEntryId" = 'forged-1'), 0, 'and it gets no bucket from A''s mapping');

select * from finish();
rollback;
