-- Plans -> Income sources (ticket 9): add_income_source presets, rename, rule, own split, lands in,
-- archive, remove. Happy paths, refused input, cross-user, and "rule changes only reach money that
-- has not been given a job yet".
begin;
select plan(82);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('acc-mari',  'aaaaaaaa-0000-0000-0000-000000000001', 'MariBank', 1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('acc-gcash', 'aaaaaaaa-0000-0000-0000-000000000001', 'GCash',    3, 0, 'PHP', 'i', 2, false, 1, 1, 2),
  ('acc-old',   'aaaaaaaa-0000-0000-0000-000000000001', 'Old',      0, 0, 'PHP', 'i', 3, true,  1, 1, 2),
  ('acc-b-1',   'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank',   1, 0, 'PHP', 'i', 1, false, 1, 1, 2);

insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder") values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Tax',         'set_aside', 'tax',       'acc-mari',  false, 1),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Living',      'spend',     'living',    'acc-gcash', false, 2),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rent',        'set_aside', 'rent',      'acc-mari',  false, 3),
  ('b1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency',   'save',      'emergency', 'acc-mari',  false, 4),
  ('b1000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sinking',     'save',      'sinking',   'acc-mari',  false, 5),
  ('b1000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fun',         'spend',     'fun',       'acc-gcash', false, 6),
  ('b1000000-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'Scholarship', 'set_aside', 'dost',      'acc-mari',  true,  7),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Emergency',   'save',      'emergency', 'acc-b-1',   false, 1),
  ('b2000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Living',      'spend',     'living',    'acc-b-1',   false, 2);

-- an existing, unused income category named Gift (the preset reuses it), and a used one
insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "syncStatus") values
  ('cat-gift',  'aaaaaaaa-0000-0000-0000-000000000001', 'Gift',  'i', 'c', 0, false, 1, 1, 1, 2),
  ('cat-tips',  'aaaaaaaa-0000-0000-0000-000000000001', 'Tips',  'i', 'c', 0, false, 2, 1, 1, 2);

-- Side (own 10/40/50) with an income already confirmed: its allocations are history.
insert into public.income_sources (id, user_id, name, kind, rule, "landsInAccountId") values
  ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Freelance', 'side_hustle', 'own', 'acc-gcash'),
  ('d1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Tipjar',    'other',       'ask', 'acc-gcash');
insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp") values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 1000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000006', 4000),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000007', 5000);
insert into public.income_sources (id, user_id, name, kind, rule) values
  ('d2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Work', 'salary', 'ask');
insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('inc-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-gcash', 100000, 0, 0, 1790000000000, 1, 1, 2),
  ('inc-2', 'aaaaaaaa-0000-0000-0000-000000000001', 'acc-gcash', 100000, 0, 0, 1790100000000, 1, 1, 2);
insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-1', 'd1000000-0000-0000-0000-000000000002', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'inc-2', 'd1000000-0000-0000-0000-000000000002', null);

create function pg_temp.as_a() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true) $$;
create function pg_temp.as_b() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true) $$;
-- id of A's live source by name; own split as 'tax=1000,sinking=4000,...'
create function pg_temp.src(p_name text) returns uuid language sql as $$
  select id from public.income_sources where name = p_name and "deletedAt" is null and user_id = auth.uid() $$;
create function pg_temp.split(p_name text) returns text language sql as $$
  select coalesce(string_agg(b.hue || '=' || l."percentBp", ',' order by b."displayOrder"), '')
    from public.income_source_split_lines l join public.buckets b on b.id = l."bucketId"
   where l."sourceId" = pg_temp.src(p_name) and l."deletedAt" is null $$;
create function pg_temp.rule(p_name text) returns text language sql as $$
  select rule || coalesce(':' || (select b.hue from public.buckets b where b.id = s."wholeBucketId"), '') from public.income_sources s where s.id = pg_temp.src(p_name) $$;
grant execute on function pg_temp.as_a(), pg_temp.as_b(), pg_temp.src(text), pg_temp.split(text), pg_temp.rule(text) to authenticated;

select ok(not has_function_privilege('anon', 'public.add_income_source(text, text)', 'execute'), 'anon cannot execute add_income_source');
select ok(not has_function_privilege('anon', 'public.save_income_source_split(uuid, jsonb)', 'execute'), 'anon cannot execute save_income_source_split');
select ok(not has_function_privilege('anon', 'public.remove_income_source(uuid)', 'execute'), 'anon cannot execute remove_income_source');

-- confirm the first Freelance income under its own split BEFORE any edit; this is the history
set local role authenticated;
select pg_temp.as_a();
select lives_ok($$select public.confirm_incomes(array['inc-1'])$$, 'inc-1 is confirmed with the current own split');
reset role;
create temp table snap as select md5(string_agg(a::text, '|' order by a.id)) as h, count(*) as n from public.allocations a;
grant select on snap to authenticated;
set local role authenticated;
select pg_temp.as_a();

-- ---------------------------------------------------------------- presets
select lives_ok($$select public.add_income_source('salary')$$, 'salary preset');
select is(pg_temp.rule('Salary'), 'plan', 'salary -> split by plan');
select lives_ok($$select public.add_income_source('scholarship')$$, 'scholarship preset');
select is(pg_temp.rule('Scholarship'), 'whole:dost', 'scholarship -> whole, Scholarship bucket');
select lives_ok($$select public.add_income_source('side_hustle')$$, 'side hustle preset');
select is(pg_temp.rule('Side hustle'), 'own', 'side hustle -> its own split');
select is(pg_temp.split('Side hustle'), 'tax=1000,sinking=4000,fun=5000', 'side hustle -> Tax 10 / Sinking 40 / Fun 50');
select lives_ok($$select public.add_income_source('allowance')$$, 'allowance preset');
select is(pg_temp.rule('Allowance'), 'whole:living', 'allowance -> whole Living');
select lives_ok($$select public.add_income_source('gift')$$, 'gift preset');
select lives_ok($$select public.add_income_source('refund')$$, 'refund preset');
select lives_ok($$select public.add_income_source('other')$$, 'other preset');
select is(pg_temp.rule('Gift') || ',' || pg_temp.rule('Refund') || ',' || pg_temp.rule('Other'), 'ask,ask,ask', 'gift, refund, other -> ask');
select throws_ok($$select public.add_income_source('lottery')$$, '22023', null, 'an unknown kind is refused');
select throws_ok($$select public.add_income_source('gift', repeat('x', 61))$$, '22023', null, 'a name over 60 characters is refused');

select is((select c."categoryType" from public.categories c join public.income_sources s on s."categoryId" = c.id where s.id = pg_temp.src('Salary')), 0::bigint, 'the new source has an income category');
select is((select c.name from public.categories c join public.income_sources s on s."categoryId" = c.id where s.id = pg_temp.src('Salary')), 'Salary', 'the category carries the source name');
select is((select "categoryId" from public.income_sources where id = pg_temp.src('Gift')), 'cat-gift', 'an unused income category with the same name is reused');
select is((select count(*)::int from public.categories where lower(name) = 'gift' and "deletedAt" is null), 1, 'no duplicate Gift category');

select lives_ok($$select public.add_income_source('salary')$$, 'a second salary source');
select ok(pg_temp.src('Salary 2') is not null, 'a repeated preset name gets a number');
select lives_ok($$select public.add_income_source('other', 'Tips box')$$, 'a custom name is accepted');
select ok(pg_temp.src('Tips box') is not null, 'the custom name is used');

-- ---------------------------------------------------------------- rename
select lives_ok($$select public.rename_income_source(pg_temp.src('Salary 2'), '  Day job  ')$$, 'a new source can be renamed');
select ok(pg_temp.src('Day job') is not null, 'name is trimmed');
select is((select c.name from public.categories c join public.income_sources s on s."categoryId" = c.id where s.id = pg_temp.src('Day job')), 'Day job', 'its category is renamed with it');
select throws_ok($$select public.rename_income_source(pg_temp.src('Day job'), '   ')$$, '22023', null, 'an empty name is refused');
select throws_ok($$select public.rename_income_source(pg_temp.src('Day job'), 'salary')$$, '23505', null, 'a name already in use is refused (case-insensitive)');
select throws_ok($$select public.rename_income_source(pg_temp.src('Freelance'), 'Gigs')$$, '55000', null, 'a source that already has income keeps its name');

-- ---------------------------------------------------------------- rule
select lives_ok($$select public.set_income_source_rule(pg_temp.src('Gift'), 'whole', 'b1000000-0000-0000-0000-000000000004')$$, 'keep it whole in Emergency');
select is(pg_temp.rule('Gift'), 'whole:emergency', 'rule is whole with its bucket');
select throws_ok($$select public.set_income_source_rule(pg_temp.src('Gift'), 'whole', null)$$, '22023', null, 'whole needs a bucket');
select throws_ok($$select public.set_income_source_rule(pg_temp.src('Gift'), 'whole', 'b1000000-0000-0000-0000-000000000003')$$, '22023', null, 'Rent cannot be a whole bucket');
select throws_ok($$select public.set_income_source_rule(pg_temp.src('Gift'), 'whole', 'b2000000-0000-0000-0000-000000000001')$$, '42501', null, 'another user''s bucket is refused');
select throws_ok($$select public.set_income_source_rule(pg_temp.src('Gift'), 'sometimes')$$, '22023', null, 'an unknown rule is refused');
select lives_ok($$select public.set_income_source_rule(pg_temp.src('Gift'), 'plan')$$, 'back to split by plan');
select is(pg_temp.rule('Gift'), 'plan', 'moving off whole clears the bucket');
select lives_ok($$select public.set_income_source_rule(pg_temp.src('Side hustle'), 'ask')$$, 'own -> ask');
select is(pg_temp.split('Side hustle'), 'tax=1000,sinking=4000,fun=5000', 'the own split is kept while the rule is something else');
select lives_ok($$select public.set_income_source_rule(pg_temp.src('Side hustle'), 'own')$$, 'ask -> own restores the split');

-- ---------------------------------------------------------------- own split
select lives_ok($$select public.save_income_source_split(pg_temp.src('Side hustle'), '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":2000},
  {"bucketId":"b1000000-0000-0000-0000-000000000006","percentBp":3000},
  {"bucketId":"b1000000-0000-0000-0000-000000000007","percentBp":4000},
  {"bucketId":"b1000000-0000-0000-0000-000000000009","percentBp":0}]')$$, 'an incomplete split (90%) is saved, never rescaled');
select is(pg_temp.split('Side hustle'), 'tax=2000,sinking=3000,fun=4000', 'lines are 20/30/40; the 0 line is not stored');
select throws_ok($$select public.split_own(100000, pg_temp.src('Side hustle'))$$, 'P0001', null, 'a split that adds to 90 is unusable, not rescaled (BR 2.1.4)');
select lives_ok($$select public.save_income_source_split(pg_temp.src('Side hustle'), '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":1000},
  {"bucketId":"b1000000-0000-0000-0000-000000000006","percentBp":3000},
  {"bucketId":"b1000000-0000-0000-0000-000000000009","percentBp":6000}]')$$, 'a complete split with Scholarship saves');
select is(pg_temp.split('Side hustle'), 'tax=1000,sinking=3000,dost=6000', 'Fun was dropped (omitted), Scholarship added');
select is((select count(*)::int from public.income_source_split_lines where "sourceId" = pg_temp.src('Side hustle') and "deletedAt" is not null), 1, 'the dropped Fun line is soft-deleted, not removed');
select throws_ok($$select public.save_income_source_split(pg_temp.src('Side hustle'), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":6000},{"bucketId":"b1000000-0000-0000-0000-000000000006","percentBp":5000}]')$$, '22023', null, 'over 100% is refused');
select throws_ok($$select public.save_income_source_split(pg_temp.src('Side hustle'), '[{"bucketId":"b1000000-0000-0000-0000-000000000003","percentBp":1000}]')$$, '22023', null, 'Rent is excluded from an own split');
select throws_ok($$select public.save_income_source_split(pg_temp.src('Side hustle'), '[{"bucketId":"b2000000-0000-0000-0000-000000000001","percentBp":1000}]')$$, '42501', null, 'another user''s bucket is refused');
select throws_ok($$select public.save_income_source_split(pg_temp.src('Side hustle'), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":1000},{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":1000}]')$$, '22023', null, 'a bucket twice is refused');
select throws_ok($$select public.save_income_source_split(pg_temp.src('Side hustle'), '[{"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":12.5}]')$$, '22023', null, 'a fractional value is refused');
select is(pg_temp.split('Side hustle'), 'tax=1000,sinking=3000,dost=6000', 'refused saves changed nothing');

-- ---------------------------------------------------------------- lands in, archive
select lives_ok($$select public.set_income_source_lands_in(pg_temp.src('Salary'), 'acc-mari')$$, 'lands in one of my accounts');
select is((select "landsInAccountId" from public.income_sources where id = pg_temp.src('Salary')), 'acc-mari', 'lands-in saved');
select throws_ok($$select public.set_income_source_lands_in(pg_temp.src('Salary'), 'acc-old')$$, '42501', null, 'an archived account is refused');
select throws_ok($$select public.set_income_source_lands_in(pg_temp.src('Salary'), 'acc-b-1')$$, '42501', null, 'another user''s account is refused');
select lives_ok($$select public.set_income_source_lands_in(pg_temp.src('Salary'), null)$$, 'lands-in can be cleared');
select lives_ok($$select public.set_income_source_archived(pg_temp.src('Freelance'), true)$$, 'a source with income can be archived');
select is((select "isArchived" from public.income_sources where id = pg_temp.src('Freelance')), true, 'it is archived');
select lives_ok($$select public.set_income_source_archived(pg_temp.src('Freelance'), false)$$, 'and restored');

-- ---------------------------------------------------------------- remove
select throws_ok($$select public.remove_income_source(pg_temp.src('Freelance'))$$, '55000', null, 'a source with income cannot be removed');
select lives_ok($$select public.remove_income_source(pg_temp.src('Allowance'))$$, 'an unused source is removed');
select is((select count(*)::int from public.income_sources where name = 'Allowance' and "deletedAt" is not null), 1, 'by soft delete');
select is((select count(*)::int from public.categories where name = 'Allowance' and "deletedAt" is not null), 1, 'its unused category goes with it');
select lives_ok($$select public.remove_income_source(pg_temp.src('Side hustle'))$$, 'a split source is removed too');
select is((select count(*)::int from public.income_source_split_lines l join public.income_sources s on s.id = l."sourceId" where s.name = 'Side hustle' and l."deletedAt" is null), 0, 'its split lines are soft-deleted');

-- ---------------------------------------------------------------- cross-user
select pg_temp.as_b();
select throws_ok(format($$select public.rename_income_source(%L, 'Mine now')$$, 'd1000000-0000-0000-0000-000000000003'::uuid), 'P0002', null, 'B cannot rename A''s source');
select throws_ok(format($$select public.set_income_source_rule(%L, 'plan')$$, 'd1000000-0000-0000-0000-000000000003'::uuid), 'P0002', null, 'B cannot change A''s rule');
select throws_ok(format($$select public.save_income_source_split(%L, '[]')$$, 'd1000000-0000-0000-0000-000000000003'::uuid), 'P0002', null, 'B cannot change A''s split');
select throws_ok(format($$select public.set_income_source_lands_in(%L, 'acc-b-1')$$, 'd1000000-0000-0000-0000-000000000003'::uuid), 'P0002', null, 'B cannot change where A''s source lands');
select throws_ok(format($$select public.remove_income_source(%L)$$, 'd1000000-0000-0000-0000-000000000003'::uuid), 'P0002', null, 'B cannot remove A''s source');
select throws_ok(format($$select public.set_income_source_archived(%L, true)$$, 'd1000000-0000-0000-0000-000000000003'::uuid), 'P0002', null, 'B cannot archive A''s source');
select lives_ok($$select public.add_income_source('side_hustle')$$, 'B adds a side hustle with only Emergency and Living buckets');
select is((select rule from public.income_sources where name = 'Side hustle' and user_id = auth.uid()), 'ask', 'it starts as ask because Tax, Sinking and Fun are missing');
select is((select count(*)::int from public.income_source_split_lines where "sourceId" in (select id from public.income_sources where name = 'Side hustle' and user_id = auth.uid())), 0, 'and has no half-made split');

-- ---------------------------------------------------------------- history: only future money sees edits
select pg_temp.as_a();
select lives_ok($$select public.save_income_source_split(pg_temp.src('Freelance'), '[
  {"bucketId":"b1000000-0000-0000-0000-000000000001","percentBp":2000},
  {"bucketId":"b1000000-0000-0000-0000-000000000006","percentBp":3000},
  {"bucketId":"b1000000-0000-0000-0000-000000000007","percentBp":5000}]')$$, 'Freelance moves from 10/40/50 to 20/30/50 after inc-1 was confirmed');
reset role;
select is((select md5(string_agg(a::text, '|' order by a.id)) from public.allocations a), (select h from snap), 'the earlier confirmed allocations did not change (edits, archive, remove)');
set local role authenticated;
select pg_temp.as_a();
select is((select string_agg(a."amountMinor"::text, ',' order by a."amountMinor") from public.confirm_incomes(array['inc-2']) a), '20000,30000,50000', 'income confirmed after the edit uses the new split');

select * from finish();
rollback;
