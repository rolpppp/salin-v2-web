-- finish_onboarding + apply_plan_only (ticket 18 SQL half, SPEC 7.5-7.6, BR 12.7-12.8 O5/O6).
-- Web path O1/O6 (4 transfers), idempotency, first pay with ticked transfers, rent redirect (O2), app path with
-- existing rows, just track (O5) and then "Make a plan", draft validation (22023), ownership refusals (42501).
begin;
select plan(121);

insert into auth.users (id, instance_id, aud, role)
select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from unnest(array[
  'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003',
  'dddddddd-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000006',
  '99999999-0000-0000-0000-000000000007']::uuid[]) u;

-- B owns rows whose ids no other user may reference
insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus") values
  ('b-acc', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Bank', 1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  -- app-path fixtures for C
  ('c-bank',  'cccccccc-0000-0000-0000-000000000003', 'C Bank',  1, 0, 'PHP', 'i', 1, false, 1, 1, 2),
  ('c-gcash', 'cccccccc-0000-0000-0000-000000000003', 'C GCash', 3, 0, 'PHP', 'i', 2, false, 1, 1, 2),
  ('g-acc',   '99999999-0000-0000-0000-000000000007', 'G Bank',  1, 0, 'PHP', 'i', 1, false, 1, 1, 2);
insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "syncStatus") values
  ('b-cat',    'bbbbbbbb-0000-0000-0000-000000000002', 'B Food',   'c', '#000000', 1, false, 1, 1, 1, 2),
  ('b-inccat', 'bbbbbbbb-0000-0000-0000-000000000002', 'B Salary', 'c', '#000000', 0, false, 2, 1, 1, 2),
  ('c-cat-sal', 'cccccccc-0000-0000-0000-000000000003', 'Salary',    'c', '#000000', 0, false, 1, 1, 1, 2),
  ('c-groc',    'cccccccc-0000-0000-0000-000000000003', 'Groceries', 'c', '#000000', 1, false, 2, 1, 1, 2),
  ('c-fun',     'cccccccc-0000-0000-0000-000000000003', 'Movies',    'c', '#000000', 1, false, 3, 1, 1, 2),
  ('c-weird',   'cccccccc-0000-0000-0000-000000000003', 'Zzz',       'c', '#000000', 1, false, 4, 1, 1, 2),
  ('c-tuit',    'cccccccc-0000-0000-0000-000000000003', 'Tuition',   'c', '#000000', 1, false, 5, 1, 1, 2);
create function pg_temp.ms(d date) returns bigint language sql as $$ select (extract(epoch from ((d::timestamp + interval '12 hours') at time zone 'Asia/Manila')) * 1000)::bigint $$;
insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus") values
  ('b-entry',  'bbbbbbbb-0000-0000-0000-000000000002', 'b-acc', 'b-inccat', 777700, 0, 0, pg_temp.ms(current_date - 4), 1, 1, 2),
  ('c-inc-1',  'cccccccc-0000-0000-0000-000000000003', 'c-bank', 'c-cat-sal', 2500000, 0, 0, pg_temp.ms(current_date - 3), 1, 1, 2),
  ('c-sp-new', 'cccccccc-0000-0000-0000-000000000003', 'c-gcash', 'c-groc', 30000, 1, 0, pg_temp.ms(current_date - 2), 1, 1, 2),
  ('c-sp-old', 'cccccccc-0000-0000-0000-000000000003', 'c-gcash', 'c-groc', 99999, 1, 0, pg_temp.ms(current_date - 40), 1, 1, 2);

-- the O1 web-path draft; every id is prefixed so users do not collide
create function pg_temp.d(p text) returns jsonb language sql as $$
  select replace(replace($j$
  {"v":1,"path":"web","step":"first","skipped":false,"planOnly":false,"firstName":"Rolf",
   "income":{"kind":"salary","amountMinor":2500000,"frequency":"twice","nextPayday":"2026-10-21","paidInOtherCurrency":false},
   "sources":[{"key":"main","name":"Salary","kind":"salary","rule":"plan","wholeBucket":null,"ownSplit":null,"landsInAccountId":"PFX-bpi","categoryId":null,"isMain":true}],
   "accounts":[{"id":"PFX-gcash","name":"GCash","type":"eWallet","currency":"PHP","isNew":true},
               {"id":"PFX-bpi","name":"BPI","type":"bank","currency":"PHP","isNew":true},
               {"id":"PFX-maya","name":"Maya","type":"eWallet","currency":"PHP","isNew":true},
               {"id":"PFX-tonik","name":"Tonik","type":"savings","currency":"PHP","isNew":true},
               {"id":"PFX-mp2","name":"Pag-IBIG MP2","type":"investment","currency":"PHP","isNew":true}],
   "landingAccountId":"PFX-bpi","priority":"safety","goal":null,"billsMinor":600000,"billKinds":["rent"],"billsStart":null,
   "preset":"suggested","planA":{"living":38,"rent":12,"fun":10,"emergency":25,"invest":5,"sinking":10,"tax":0,"buffer":0},
   "planEdited":false,"planInputsSig":null,"planBOn":true,"targetMinor":7500000,
   "homes":{"living":"PFX-gcash","fun":"PFX-maya","rent":"PFX-bpi","tax":"PFX-bpi","buffer":"PFX-bpi","emergency":"PFX-tonik","sinking":"PFX-tonik","invest":"PFX-mp2"},
   "homesUserSet":[],"categories":null,
   "firstPay":{"choice":"yes","entryId":"PFX-pay","amountMinor":2500000,"date":"PAYDATE","splitConfirmed":true,"ticked":[],"reminder":"email"}}
  $j$, 'PFX', p), 'PAYDATE', to_char(current_date - 5, 'YYYY-MM-DD'))::jsonb
$$;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

select ok(has_function_privilege('authenticated', 'public.finish_onboarding(jsonb)', 'execute'), 'authenticated can execute finish_onboarding');
select ok(not has_function_privilege('anon', 'public.finish_onboarding(jsonb)', 'execute'), 'anon cannot execute finish_onboarding');
select ok(has_function_privilege('authenticated', 'public.apply_plan_only(jsonb)', 'execute'), 'authenticated can execute apply_plan_only');
select ok(not has_function_privilege('anon', 'public.apply_plan_only(jsonb)', 'execute'), 'anon cannot execute apply_plan_only');

set local role authenticated;

-- =========================================================== A: O1 on the web path, O6
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
create temp table ra as select public.finish_onboarding(pg_temp.d('a')) as r;
grant select on ra to authenticated;

select is((select r from ra),
  '{"bucketsCount":7,"splitMinor":2500000,"splitBucketsCount":6,"transfersCount":4,"transfersTicked":0,"safeToSpendMinor":1200000,"emergencyLeftMinor":625000,"spendingBeforeMinor":0}'::jsonb,
  'O6: summary of the Done card');
select is((select count(*)::int from public.accounts), 5, 'five accounts created');
select is((select to_jsonb(a) - 'createdAt' - 'updatedAt' - 'displayOrder' - 'user_id' from public.accounts a where id = 'a-gcash'),
  '{"id":"a-gcash","name":"GCash","accountType":3,"openingBalanceMinor":0,"currency":"PHP","icon":"default_icon","color":null,"isArchived":false,"deletedAt":null,"syncStatus":2}'::jsonb,
  'an account is a mobile-valid row (eWallet = 3, synced)');
select is((select "accountType" from public.accounts where id = 'a-mp2'), 6::bigint, 'investment = 6');
select is((select jsonb_object_agg(hue, "keptInAccountId") from public.buckets),
  '{"living":"a-gcash","rent":"a-bpi","fun":"a-maya","emergency":"a-tonik","invest":"a-mp2","sinking":"a-tonik","buffer":"a-bpi"}'::jsonb,
  'O6 homes: Living GCash, Rent BPI, Fun Maya, Emergency Tonik, Sinking Tonik, Investments MP2');
select is((select name from public.buckets where hue = 'rent'), 'Rent', 'one bill kind (rent) names the bucket Rent');
select is((select jsonb_object_agg(name, "groupKey") from public.buckets where hue in ('living', 'emergency', 'buffer')),
  '{"Living":"spend","Emergency fund":"save","Buffer":"set_aside"}'::jsonb, 'Living, Emergency and Buffer always exist, in their groups');
select is((select jsonb_object_agg(b.hue, l."percentBp") from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId"
            join public.buckets b on b.id = l."bucketId" where p.key = 'A' and l."deletedAt" is null),
  '{"living":3800,"rent":1200,"fun":1000,"emergency":2500,"invest":500,"sinking":1000,"buffer":0}'::jsonb, 'Plan A lines in bp (buckets with a share, plus Buffer at 0)');
select is((select jsonb_object_agg(b.hue, l."percentBp") from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId"
            join public.buckets b on b.id = l."bucketId" where p.key = 'B' and l."deletedAt" is null and b.hue in ('emergency', 'invest')),
  '{"emergency":500,"invest":2500}'::jsonb, 'Plan B: Emergency 5, Investments 25');
select is((select params from public.allocation_rules where kind = 'switch_on_goal'),
  jsonb_build_object('fromPlan', 'A', 'toPlan', 'B', 'targetMinor', 7500000, 'bucketId', (select id from public.buckets where hue = 'emergency')),
  'switch rule: target 75,000 on the Emergency bucket');
select is((select count(*)::int from public.allocation_rules where kind = 'redirect_until_date'), 0, 'bills start now: no redirect rule');
select is((select jsonb_build_object('name', name, 'target', "targetMinor", 'sw', "isPlanSwitch", 'linked', "linkedBucketId" = (select id from public.buckets where hue = 'emergency'), 'n', (select count(*) from public.goals))
             from public.goals),
  '{"name":"Emergency fund","target":7500000,"sw":true,"linked":true,"n":1}'::jsonb, 'one goal: Emergency fund, target = safety net, the plan switch');
select is((select to_jsonb(u) - 'user_id' - 'createdAt' - 'updatedAt' - 'onboardedAt' - 'deletedAt' from public.user_profiles u),
  jsonb_build_object('firstName', 'Rolf', 'homeCurrency', 'PHP', 'weekStartsOn', 1, 'reviewDay', 0, 'nextPaydayDate', '2026-10-21', 'payFrequency', 'twice',
                     'planMode', 'plan', 'priority', 'safety', 'onboardingPath', 'web', 'onboardingDraft', '{}'::jsonb, 'paydayReminder', 'email'),
  'profile: answers saved, draft cleared');
select ok((select "onboardedAt" is not null from public.user_profiles), 'onboardedAt is set');
select is((select jsonb_build_object('name', name, 'kind', kind, 'rule', rule, 'lands', "landsInAccountId", 'cat', "categoryId" is not null) from public.income_sources),
  '{"name":"Salary","kind":"salary","rule":"plan","lands":"a-bpi","cat":true}'::jsonb, 'main income source with its rule and landing account');
select is((select to_jsonb(c) - 'id' - 'user_id' - 'createdAt' - 'updatedAt' - 'displayOrder' from public.categories c where "categoryType" = 0),
  '{"name":"Salary","icon":"category","color":"#2E6EA6","categoryType":0,"isSystem":false,"deletedAt":null,"syncStatus":2}'::jsonb, 'income category is a mobile-valid row');
select is((select jsonb_build_object('acct', "accountId", 'amt', "amountMinor", 'dir', direction, 'origin', origin, 'sync', "syncStatus", 'note', note, 'cat', "categoryId" = (select "categoryId" from public.income_sources),
                                      'date', public.entry_local_date("occurredAt")::text)
             from public.ledger_entries where id = 'a-pay'),
  jsonb_build_object('acct', 'a-bpi', 'amt', 2500000, 'dir', 0, 'origin', 0, 'sync', 2, 'note', null, 'cat', true, 'date', to_char(current_date - 5, 'YYYY-MM-DD')),
  'the first pay is a mobile-valid inflow on the landing account, in the source''s category');
select is((select jsonb_build_object('job', job, 'src', "sourceId" = (select id from public.income_sources)) from public.income_meta where "ledgerEntryId" = 'a-pay'),
  '{"job":"plan","src":true}'::jsonb, 'the first pay is linked to the main source with the plan job');
select is((select jsonb_object_agg(b.hue, a."amountMinor") from public.allocations a join public.buckets b on b.id = a."bucketId" where a."ledgerEntryId" = 'a-pay'),
  '{"living":950000,"rent":300000,"fun":250000,"emergency":625000,"invest":125000,"sinking":250000}'::jsonb, 'O1 split of 25,000 confirmed');
select is((select count(*)::int from public.transfer_plan() where kind = 'transfer'), 4, 'O6: exactly 4 transfers');
select is((select jsonb_object_agg(to_account_id, amount) from public.transfer_plan() where kind = 'transfer' and from_account_id = 'a-bpi'),
  '{"a-gcash":950000,"a-maya":250000,"a-tonik":875000,"a-mp2":125000}'::jsonb, 'O6: BPI sends to GCash, Maya, Tonik (Emergency + Sinking), MP2');
select is((select count(*)::int from public.transfer_plan() where kind = 'keep' and from_account_id = 'a-bpi' and amount = 300000), 1, 'Rent stays in BPI');
select is((select count(*)::int from public.category_buckets where source = 'auto'), 16, 'web path: 16 default categories mapped automatically (6 living, 4 fun, 5 sinking, 1 bill)');
select is((select count(*)::int from public.categories where "categoryType" = 1 and "syncStatus" = 2 and "isSystem" = false), 16, 'default categories are mobile-valid expense rows');
select is((select jsonb_object_agg(c.name, b.hue) from public.category_buckets cb join public.categories c on c.id = cb."categoryId" join public.buckets b on b.id = cb."bucketId"
            where c.name in ('Groceries', 'Eating out', 'School', 'Rent')),
  '{"Groceries":"living","Eating out":"fun","School":"sinking","Rent":"rent"}'::jsonb, 'default categories land in their buckets');

-- idempotent: a second call changes nothing and returns the same summary (even with a different draft)
create temp table ra2 as select public.finish_onboarding(pg_temp.d('a')) as r;
select is((select r from ra2), (select r from ra), 'second call returns the same summary');
select is(public.finish_onboarding('{}'::jsonb), (select r from ra), 'and does not even look at a different draft');
select is((select jsonb_build_object('acc', (select count(*) from public.accounts), 'b', (select count(*) from public.buckets), 'al', (select count(*) from public.allocations),
                                     'g', (select count(*) from public.goals), 'cat', (select count(*) from public.categories), 'ev', (select count(*) from public.events),
                                     'led', (select count(*) from public.ledger_entries), 'src', (select count(*) from public.income_sources))),
  '{"acc":5,"b":7,"al":6,"g":1,"cat":17,"ev":1,"led":1,"src":1}'::jsonb, 'row counts unchanged after the second call');

-- =========================================================== E: first pay with ticked transfers
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
select is((public.finish_onboarding(jsonb_set(pg_temp.d('e'), '{firstPay,ticked}',
  '[{"fromAccountId":"e-bpi","toAccountId":"e-gcash"},{"fromAccountId":"e-bpi","toAccountId":"e-maya"}]')) ->> 'transfersTicked')::int, 2, 'two ticked transfers are recorded');
select is((select jsonb_object_agg("toAccountId", "sentMinor") from public.transfer_checks), '{"e-gcash":950000,"e-maya":250000}'::jsonb, 'sent amounts = the checklist amounts');
select is((select count(*)::int from public.transfers where "syncStatus" = 2 and note = 'Transfer'), 2, 'two mobile-shaped transfers');
select is((select count(*)::int from public.ledger_entries where origin = 3 and "transferId" is not null and ("id" like '%\_out' or "id" like '%\_in')), 4, 'each with an _out and an _in leg');
select ok((select "closedAt" is null from public.transfer_cycles), 'the cycle stays open: two transfers are still to send');
select is((select count(*)::int from public.transfer_plan() where kind = 'transfer' and done), 2, 'transfer_plan shows two done');
select is((select (public.finish_onboarding('{}'::jsonb) ->> 'transfersCount')::int), 4, 'repeat call: same summary');

-- =========================================================== F: O2, rent redirect, bills kind, tax and buffer
select pg_temp.as_user('ffffffff-0000-0000-0000-000000000006');
create temp table rf as select public.finish_onboarding(
  pg_temp.d('f') || jsonb_build_object(
    'income', '{"kind":"salary","amountMinor":1732900,"frequency":"biweekly","nextPayday":"2026-10-21","paidInOtherCurrency":true}'::jsonb,
    'accounts', '[{"id":"f-bpi","name":"BPI","type":"bank","currency":"PHP","isNew":true}]'::jsonb,
    'sources', '[{"key":"main","name":"Salary","kind":"salary","rule":"plan","wholeBucket":null,"ownSplit":null,"landsInAccountId":null,"categoryId":null,"isMain":true}]'::jsonb,
    'landingAccountId', 'f-bpi', 'billsMinor', 200000, 'billKinds', '["tuition"]'::jsonb, 'billsStart', to_char(current_date + 60, 'YYYY-MM-DD'),
    'homes', '{"living":"f-bpi","fun":"f-bpi","rent":"f-bpi","tax":"f-bpi","buffer":"f-bpi","emergency":"f-bpi","sinking":"f-bpi","invest":"f-bpi"}'::jsonb,
    'planA', '{"living":44,"rent":6,"fun":5,"emergency":25,"invest":5,"sinking":6,"tax":6,"buffer":3}'::jsonb, 'targetMinor', 5700000,
    'firstPay', jsonb_build_object('choice', 'yes', 'entryId', 'f-pay', 'amountMinor', 1732900, 'date', to_char(current_date - 5, 'YYYY-MM-DD'),
                                   'splitConfirmed', true, 'ticked', '[]'::jsonb, 'reminder', 'none'))) as r;
select is((select jsonb_object_agg(b.hue, a."amountMinor") from public.allocations a join public.buckets b on b.id = a."bucketId"),
  '{"living":762476,"fun":86645,"emergency":537199,"invest":86645,"sinking":103974,"tax":103974,"buffer":51987}'::jsonb,
  'O2: before the bills start, Rent is 0 and its share goes to Emergency');
select is((select name from public.buckets where hue = 'rent'), 'Tuition', 'one bill kind (tuition) names the bucket Tuition');
select is((select params ->> 'untilDate' from public.allocation_rules where kind = 'redirect_until_date'), to_char(current_date + 60, 'YYYY-MM-DD'), 'redirect rule runs until the bills start');
select is((select (params ->> 'fromBucketId')::uuid from public.allocation_rules where kind = 'redirect_until_date'), (select id from public.buckets where hue = 'rent'), 'redirect from Rent');
select is((select (params ->> 'toBucketId')::uuid from public.allocation_rules where kind = 'redirect_until_date'), (select id from public.buckets where hue = 'emergency'), 'redirect to Emergency');
select is((select r -> 'transfersCount' from rf), '0'::jsonb, 'every bucket kept where pay lands: no transfers');
select ok((select "closedAt" is not null from public.transfer_cycles), 'nothing to send: the cycle closes at once');
select is((select count(*)::int from public.categories where name = 'Tuition' and "categoryType" = 1), 1, 'the bill kind became an expense category');
select is((select count(*)::int from public.category_buckets cb join public.categories c on c.id = cb."categoryId" where c.name in ('Tax payments', 'Fees & charges')), 2, 'Tax and Buffer have categories when they have a share');
select is((select jsonb_object_agg(b.hue, l."percentBp") from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId"
            join public.buckets b on b.id = l."bucketId" where p.key = 'A' and l."deletedAt" is null),
  '{"living":4400,"rent":600,"fun":500,"emergency":2500,"invest":500,"sinking":600,"tax":600,"buffer":300}'::jsonb, 'O2 plan A in bp');

-- =========================================================== C: the app path (existing accounts, categories and income entry)
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
create temp table rc as select public.finish_onboarding(
  pg_temp.d('c') || jsonb_build_object(
    'path', 'app',
    'accounts', '[{"id":"c-bank","name":"C Bank","type":"bank","currency":"PHP","isNew":false},{"id":"c-gcash","name":"C GCash","type":"eWallet","currency":"PHP","isNew":false}]'::jsonb,
    'landingAccountId', 'c-bank',
    'sources', '[{"key":"c-cat-sal","name":"Salary","kind":"salary","rule":"plan","wholeBucket":null,"ownSplit":null,"landsInAccountId":"c-bank","categoryId":"c-cat-sal","isMain":true},
                 {"key":"side","name":"Logo commissions","kind":"side_hustle","rule":"own","wholeBucket":null,"ownSplit":{"tax":10,"sinking":40,"fun":50},"landsInAccountId":"c-gcash","categoryId":null,"isMain":false},
                 {"key":"allow","name":"Allowance from home","kind":"allowance","rule":"whole","wholeBucket":"living","ownSplit":null,"landsInAccountId":null,"categoryId":null,"isMain":false}]'::jsonb,
    'homes', '{"living":"c-gcash","fun":"c-bank","rent":"c-bank","tax":"c-bank","buffer":"c-bank","emergency":"c-bank","sinking":"c-bank","invest":"c-bank"}'::jsonb,
    'categories', '{"c-groc":{"bucket":"living","source":"auto","notSure":false},"c-fun":{"bucket":"fun","source":"auto","notSure":false},
                    "c-weird":{"bucket":"living","source":"auto","notSure":true},"c-tuit":{"bucket":"rent","source":"user","notSure":false}}'::jsonb,
    'firstPay', jsonb_build_object('choice', 'yes', 'entryId', 'c-inc-1', 'amountMinor', 2500000, 'date', to_char(current_date - 3, 'YYYY-MM-DD'),
                                   'splitConfirmed', true, 'ticked', '[{"fromAccountId":"c-bank","toAccountId":"c-gcash"}]'::jsonb, 'reminder', 'none'))) as r;
select is((select r from rc),
  '{"bucketsCount":8,"splitMinor":2500000,"splitBucketsCount":6,"transfersCount":1,"transfersTicked":1,"safeToSpendMinor":1170000,"emergencyLeftMinor":625000,"spendingBeforeMinor":30000}'::jsonb,
  'app path summary: spending logged since the pay counts, older spending does not');
select is((select count(*)::int from public.ledger_entries where direction = 0 and origin = 0), 1, 'the existing pay was used, no duplicate inflow was inserted');
select is((select jsonb_build_object('job', job, 'src', "sourceId" = (select id from public.income_sources where name = 'Salary')) from public.income_meta where "ledgerEntryId" = 'c-inc-1'),
  '{"job":"plan","src":true}'::jsonb, 'the existing entry is linked to the main source');
select is((select "categoryId" from public.income_sources where name = 'Salary'), 'c-cat-sal', 'the main source uses the existing income category');
select is((select count(*)::int from public.categories where "categoryType" = 0), 3, 'the two sources without a category got one');
select is((select jsonb_object_agg(c.name, jsonb_build_object('hue', b.hue, 'source', cb.source)) from public.category_buckets cb join public.categories c on c.id = cb."categoryId" join public.buckets b on b.id = cb."bucketId" where c."categoryType" = 1),
  '{"Groceries":{"hue":"living","source":"auto"},"Movies":{"hue":"fun","source":"auto"},"Zzz":{"hue":"living","source":"auto"},"Tuition":{"hue":"rent","source":"user"}}'::jsonb,
  'the sorted categories are saved with their sources (user-set stays user)');
select is((select count(*)::int from public.entry_buckets), 1, 'only the spending since the pay was frozen into a bucket');
select is((select "ledgerEntryId" from public.entry_buckets), 'c-sp-new', '... the older spending was left alone');
select is((select jsonb_object_agg(b.hue, l."percentBp") from public.income_source_split_lines l join public.buckets b on b.id = l."bucketId"),
  '{"tax":1000,"sinking":4000,"fun":5000}'::jsonb, 'own split saved in bp');
select is((select (select hue from public.buckets where id = "wholeBucketId") from public.income_sources where name = 'Allowance from home'), 'living', 'whole bucket saved');
select is((select "landsInAccountId" from public.income_sources where name = 'Allowance from home'), 'c-bank', 'a source without a landing account lands where pay lands');
select is((select count(*)::int from public.transfers where "fromAccountId" = 'c-bank' and "toAccountId" = 'c-gcash'), 1, 'the ticked transfer was recorded');
select is((select "sentMinor" from public.transfer_checks), 950000::bigint, 'with the amount sent');

-- =========================================================== D: just track (O5), then Make a plan
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
create temp table rd as select public.finish_onboarding(
  pg_temp.d('d') || jsonb_build_object(
    'skipped', true, 'priority', null, 'planA', null, 'planBOn', false, 'targetMinor', null, 'billsMinor', 0, 'billKinds', '[]'::jsonb, 'homes', null,
    'accounts', '[{"id":"d-bpi","name":"BPI","type":"bank","currency":"PHP","isNew":true},{"id":"d-gcash","name":"GCash","type":"eWallet","currency":"PHP","isNew":true}]'::jsonb,
    'sources', '[{"key":"main","name":"Salary","kind":"salary","rule":"plan","wholeBucket":null,"ownSplit":null,"landsInAccountId":null,"categoryId":null,"isMain":true}]'::jsonb,
    'landingAccountId', 'd-bpi')) as r;
select is((select r from rd),
  '{"bucketsCount":3,"splitMinor":2500000,"splitBucketsCount":1,"transfersCount":0,"transfersTicked":0,"safeToSpendMinor":2500000,"emergencyLeftMinor":0,"spendingBeforeMinor":0}'::jsonb,
  'O5: just track: everything goes to Spending, no transfers');
select is((select jsonb_object_agg(name, hue) from public.buckets), '{"Spending":"living","Buffer":"buffer","Emergency fund":"emergency"}'::jsonb, 'just track: Living is renamed Spending; Buffer and Emergency exist at 0%');
select is((select jsonb_object_agg(b.hue, l."percentBp") from public.allocation_plan_lines l join public.buckets b on b.id = l."bucketId" where l."deletedAt" is null),
  '{"living":10000,"buffer":0,"emergency":0}'::jsonb, 'Plan A = Spending 100%');
select is((select count(*)::int from public.allocation_plans where key = 'B'), 0, 'no Plan B');
select is((select count(*)::int from public.allocation_rules), 0, 'no rules');
select is((select count(*)::int from public.goals), 0, 'no goals');
select is((select count(distinct "keptInAccountId")::int from public.buckets), 1, 'every bucket is kept where pay lands');
select is((select jsonb_build_object('mode', "planMode", 'priority', priority) from public.user_profiles), '{"mode":"track","priority":null}'::jsonb, 'planMode track');
select is((select count(*)::int from public.category_buckets cb join public.buckets b on b.id = cb."bucketId" where b.hue = 'living' and cb.source = 'auto'), 15, 'all categories are in Spending, automatic');
select is((select count(*)::int from public.categories where "categoryType" = 1), 15, 'just track: the everyday categories only');

-- the user sets one category by hand and adds a goal, then "Make a plan"
select is((select public.move_category((select id from public.categories where name = 'Health'), (select id from public.buckets where hue = 'emergency'))), 0, 'the user moves Health to Emergency by hand');
select ok((select public.add_goal('Laptop', 5000000)) is not null, 'the user has a goal of their own');
create temp table d_before as
  select (select jsonb_agg(to_jsonb(a) - 'updatedAt' order by a.seq) from public.allocations a) as al;
select throws_like($$select public.apply_plan_only(pg_temp.d('d') || '{"skipped":true}')$$, '%not a plan%', 'plan-only refuses a skipped draft');
select lives_ok($$select public.apply_plan_only(pg_temp.d('d') || jsonb_build_object('planOnly', true,
  'accounts', '[{"id":"d-bpi","name":"BPI","type":"bank","currency":"PHP","isNew":false},{"id":"d-gcash","name":"GCash","type":"eWallet","currency":"PHP","isNew":false}]'::jsonb,
  'homes', '{"living":"d-gcash","fun":"d-gcash","rent":"d-bpi","tax":"d-bpi","buffer":"d-bpi","emergency":"d-bpi","sinking":"d-bpi","invest":"d-bpi"}'::jsonb))$$,
  'apply_plan_only runs');
select is((select to_jsonb(a) - 'updatedAt' from public.allocations a limit 1), (select al -> 0 from d_before), 'confirmed allocations are untouched');
select is((select count(*)::int from public.allocations), 1, '... and none were added');
select is((select jsonb_build_object('mode', "planMode", 'priority', priority, 'draft', "onboardingDraft") from public.user_profiles), '{"mode":"plan","priority":"safety","draft":{}}'::jsonb, 'planMode plan, draft cleared');
select is((select jsonb_object_agg(hue, name) from public.buckets where hue in ('living', 'rent')), '{"living":"Living","rent":"Rent"}'::jsonb, 'Spending is Living again; Rent is created');
select is((select count(*)::int from public.buckets), 7, 'the plan''s buckets now exist');
select is((select jsonb_object_agg(b.hue, l."percentBp") from public.allocation_plan_lines l join public.allocation_plans p on p.id = l."planId"
            join public.buckets b on b.id = l."bucketId" where p.key = 'A' and l."deletedAt" is null),
  '{"living":3800,"rent":1200,"fun":1000,"emergency":2500,"invest":500,"sinking":1000,"buffer":0}'::jsonb, 'Plan A is the new plan');
select is((select count(*)::int from public.allocation_plans where key = 'B'), 1, 'Plan B added');
select is((select jsonb_object_agg(hue, "keptInAccountId") from public.buckets where hue in ('living', 'fun', 'emergency')),
  '{"living":"d-gcash","fun":"d-gcash","emergency":"d-bpi"}'::jsonb, 'homes updated for future money');
select is((select jsonb_object_agg(name, jsonb_build_object('target', "targetMinor", 'sw', "isPlanSwitch")) from public.goals),
  '{"Laptop":{"target":5000000,"sw":false},"Emergency fund":{"target":7500000,"sw":true}}'::jsonb, 'Emergency fund goal added; the existing goal is kept');
select is((select jsonb_object_agg(c.name, jsonb_build_object('hue', b.hue, 'source', cb.source)) from public.category_buckets cb
            join public.categories c on c.id = cb."categoryId" join public.buckets b on b.id = cb."bucketId" where c.name in ('Health', 'Eating out', 'School', 'Groceries')),
  '{"Health":{"hue":"emergency","source":"user"},"Eating out":{"hue":"fun","source":"auto"},"School":{"hue":"sinking","source":"auto"},"Groceries":{"hue":"living","source":"auto"}}'::jsonb,
  'automatic categories moved to the new buckets; the one set by hand stayed');
select is((select count(*)::int from public.allocation_rules where kind = 'switch_on_goal'), 1, 'switch rule added');
insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus")
  values ('d-pay-2', 'dddddddd-0000-0000-0000-000000000004', 'd-bpi', (select "categoryId" from public.income_sources), 1000000, 0, 0, pg_temp.ms(current_date), 1, 1, 2);
select is((select count(*)::int from public.confirm_incomes(array['d-pay-2'])), 6, 'the next payday is split by the new plan (6 buckets with a share)');
select is((select amount from public.engine_split_plan('dddddddd-0000-0000-0000-000000000004', 1000000, 'A', current_date) where bucket_id = (select id from public.buckets where hue = 'living')), 380000::bigint, 'Living now gets 38%');

-- C again: "Make a plan" on the app path moves automatic categories from the draft, never a user-set one
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select lives_ok($$select public.apply_plan_only(pg_temp.d('c') || jsonb_build_object('path', 'app', 'planOnly', true, 'landingAccountId', 'c-bank',
  'homes', '{"living":"c-bank","fun":"c-bank","rent":"c-bank","tax":"c-bank","buffer":"c-bank","emergency":"c-bank","sinking":"c-bank","invest":"c-bank"}'::jsonb,
  'categories', '{"c-groc":{"bucket":"fun","source":"auto","notSure":false},"c-tuit":{"bucket":"living","source":"auto","notSure":false},"c-weird":{"bucket":"sinking","source":"user","notSure":false}}'::jsonb))$$,
  'app-path apply_plan_only runs');
select is((select jsonb_object_agg(c.name, jsonb_build_object('hue', b.hue, 'source', cb.source)) from public.category_buckets cb join public.categories c on c.id = cb."categoryId" join public.buckets b on b.id = cb."bucketId" where c."categoryType" = 1),
  '{"Groceries":{"hue":"fun","source":"auto"},"Movies":{"hue":"fun","source":"auto"},"Zzz":{"hue":"sinking","source":"user"},"Tuition":{"hue":"rent","source":"user"}}'::jsonb,
  'Groceries moved (auto); Tuition stayed (set by the user); Zzz is now set by the user');
select is((select count(*)::int from public.allocations), 6, 'plan-only never adds allocations');

-- =========================================================== G: validation and ownership (G never finishes)
select pg_temp.as_user('99999999-0000-0000-0000-000000000007');
select throws_like($$select public.apply_plan_only(pg_temp.d('g'))$$, '%Finish setting up first%', 'plan-only before onboarding is refused');
select throws_ok($$select public.finish_onboarding('null'::jsonb)$$, '22023', null, 'a non-object draft is refused');
select throws_like($$select public.finish_onboarding(pg_temp.d('g') || '{"v":2}')$$, '%version%', 'wrong version');
select throws_like($$select public.finish_onboarding(pg_temp.d('g') || '{"planOnly":true}')$$, '%apply_plan_only%', 'a plan-only draft is refused');
select throws_like($$select public.finish_onboarding(pg_temp.d('g') || '{"path":null}')$$, '%Path must be%', 'path is required');
select throws_like($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{sources,0,isMain}', 'false'))$$, '%Exactly one income source%', 'no main source');
select throws_like($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{sources}', (pg_temp.d('g') -> 'sources') || (pg_temp.d('g') #> '{sources,0}')))$$, '%Two income sources%', 'two sources with one name');
select throws_like($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{planA,living}', '33'))$$, '%adds up to 95 percent%', 'plan totals 95: refused with the total');
select throws_like($$select public.finish_onboarding(pg_temp.d('g') || '{"planA":null}')$$, '%Your plan is missing%', 'no plan');
select throws_like($$select public.finish_onboarding(pg_temp.d('g') || '{"accounts":[]}')$$, '%at least one account%', 'no accounts');
select throws_like($$select public.finish_onboarding(pg_temp.d('g') || '{"landingAccountId":null}')$$, '%your pay lands in%', 'no landing account');
select throws_like($$select public.finish_onboarding(pg_temp.d('g') || '{"landingAccountId":"nope"}')$$, '%not one of your accounts%', 'landing account not in the list');
select throws_like($$select public.finish_onboarding(pg_temp.d('g') || '{"priority":"goal"}')$$, '%saving for%', 'priority goal needs a goal');
select throws_like($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{firstPay,date}', to_jsonb(to_char(current_date + 3, 'YYYY-MM-DD'))))$$, '%cannot be in the future%', 'first pay in the future');
select throws_like($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{income,frequency}', '"daily"'))$$, '%How often%', 'unknown frequency');
select throws_like($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{firstPay,splitConfirmed}', 'false') || '{"firstPay":{"choice":"yes","entryId":null,"amountMinor":null,"date":null,"splitConfirmed":false,"ticked":[{"fromAccountId":"g-bpi","toAccountId":"g-gcash"}],"reminder":"none"}}')$$,
  '%only be ticked after the split%', 'ticks need a confirmed split');
select throws_like($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{sources,0}', '{"key":"main","name":"Salary","kind":"scholarship","rule":"whole","wholeBucket":"rent","ownSplit":null,"landsInAccountId":null,"categoryId":null,"isMain":true}'))$$,
  '%Rent cannot be used%', 'a source cannot be kept whole in Rent');
select throws_like($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{firstPay,ticked}', '[{"fromAccountId":"g-gcash","toAccountId":"g-maya"}]'))$$,
  '%not part of your payday plan%', 'a tick that is not in the checklist is refused');
select is((select jsonb_build_object('acc', (select count(*) from public.accounts), 'b', (select count(*) from public.buckets), 'ev', (select count(*) from public.events), 'led', (select count(*) from public.ledger_entries),
                                     'profile', (select count(*) from public.user_profiles))),
  '{"acc":1,"b":0,"ev":0,"led":0,"profile":0}'::jsonb, 'every refusal rolled back: nothing was written (only G''s own existing account remains)');

-- ownership: B's ids
select throws_ok($$select public.finish_onboarding(pg_temp.d('g') || '{"accounts":[{"id":"b-acc","name":"x","type":"bank","currency":"PHP","isNew":false}],"landingAccountId":"b-acc"}')$$,
  '42501', null, 'another user''s account as the landing account');
select throws_ok($$select public.finish_onboarding(pg_temp.d('g') || '{"accounts":[{"id":"b-acc","name":"x","type":"bank","currency":"PHP","isNew":true}],"landingAccountId":"b-acc"}')$$,
  '42501', null, 'a new account that reuses another user''s id');
select throws_ok($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{homes,living}', '"b-acc"'))$$, '42501', null, 'another user''s account as a home');
select throws_ok($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{sources,0,landsInAccountId}', '"b-acc"'))$$, '42501', null, 'another user''s account as a source''s landing account');
select throws_ok($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{firstPay,ticked}', '[{"fromAccountId":"g-bpi","toAccountId":"b-acc"}]'))$$, '42501', null, 'another user''s account in a ticked transfer');
select throws_ok($$select public.finish_onboarding(pg_temp.d('g') || '{"path":"app","categories":{"b-cat":{"bucket":"living","source":"auto","notSure":false}}}')$$,
  '42501', null, 'another user''s expense category');
select throws_ok($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{sources,0,categoryId}', '"b-inccat"'))$$, '42501', null, 'another user''s income category');
select throws_ok($$select public.finish_onboarding(jsonb_set(pg_temp.d('g'), '{firstPay,entryId}', '"b-entry"'))$$, '42501', null, 'web path: a first-pay id that is another user''s entry');
select throws_ok($$select public.finish_onboarding(pg_temp.d('g') || '{"path":"app","accounts":[{"id":"g-acc","name":"G Bank","type":"bank","currency":"PHP","isNew":false}],"landingAccountId":"g-acc",
  "homes":null,"firstPay":{"choice":"yes","entryId":"b-entry","amountMinor":null,"date":null,"splitConfirmed":true,"ticked":[],"reminder":"none"}}')$$,
  '42501', null, 'app path: the pay entry is another user''s');
select is((select count(*)::int from public.buckets), 0, 'ownership refusals wrote nothing');

select * from finish();
rollback;
