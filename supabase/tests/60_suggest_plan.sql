-- suggest_plan (ticket 16, BR 12.1-12.2): golden tests O1-O4 (O5 just track is in 61_finish_onboarding), presets,
-- trimming, edge amounts, refused input, privileges. Same goldens as lib/money/suggest.test.ts.
begin;
select plan(33);

select ok(has_function_privilege('authenticated', 'public.suggest_plan(jsonb)', 'execute'), 'authenticated can execute suggest_plan');
select ok(not has_function_privilege('anon', 'public.suggest_plan(jsonb)', 'execute'), 'anon cannot execute suggest_plan');

-- ---- O1: salary 25,000 twice a month, safety net, bills 6,000 now
create temp table o1 as select public.suggest_plan('{"amountMinor":2500000,"frequency":"twice","billsMinor":600000,"priority":"safety","kind":"salary","paidInOtherCurrency":false}') as r;
select is((select r -> 'plan' from o1), '{"living":38,"rent":12,"fun":10,"emergency":25,"invest":5,"sinking":10,"tax":0,"buffer":0}'::jsonb, 'O1 plan: Living 38 Rent 12 Fun 10 Emergency 25 Invest 5 Sinking 10');
select is((select r -> 'planB' from o1), '{"living":38,"rent":12,"fun":10,"emergency":5,"invest":25,"sinking":10,"tax":0,"buffer":0}'::jsonb, 'O1 Plan B: Emergency 5, Investments 25');
select is((select (r ->> 'targetMinor')::bigint from o1), 7500000::bigint, 'O1 target 75,000');
select is((select (r ->> 'monthlyMinor')::bigint from o1), 5000000::bigint, 'O1 monthly income 50,000');
select is((select (r ->> 'billsPct')::int from o1), 12, 'O1 bills 12%');
select is((select r -> 'billsWarning' from o1), 'null'::jsonb, 'O1 no bills warning');
select is((select r -> 'billsCapped' from o1), 'false'::jsonb, 'O1 bills not capped');

-- ---- O2: 17,329 every 2 weeks, paid in AUD, safety net, bills 2,000 (start date is not part of suggest_plan)
create temp table o2 as select public.suggest_plan('{"amountMinor":1732900,"frequency":"biweekly","billsMinor":200000,"priority":"safety","kind":"salary","paidInOtherCurrency":true}') as r;
select is((select r -> 'plan' from o2), '{"living":44,"rent":6,"fun":5,"emergency":25,"invest":5,"sinking":6,"tax":6,"buffer":3}'::jsonb, 'O2 plan: trimmed Fun to 5 and Sinking to 6');
select is((select (r ->> 'targetMinor')::bigint from o2), 5700000::bigint, 'O2 target 57,000');
select is((select (r ->> 'monthlyMinor')::bigint from o2), 3754617::bigint, 'O2 monthly 37,546.17 (26/12 half up)');

-- ---- O3: 30,000 monthly, keep spending in check, bills 20,000 -> Rent capped at 45 with a warning
create temp table o3 as select public.suggest_plan('{"amountMinor":3000000,"frequency":"monthly","billsMinor":2000000,"priority":"control","kind":"salary","paidInOtherCurrency":false}') as r;
select is((select r -> 'plan' from o3), '{"living":10,"rent":45,"fun":15,"emergency":15,"invest":5,"sinking":10,"tax":0,"buffer":0}'::jsonb, 'O3 plan: Rent 45 (capped)');
select is((select r -> 'billsWarning' from o3), '{"coveredMinor":1350000,"billsMinor":2000000}'::jsonb, 'O3 warning: 13,500 < 20,000');
select is((select r -> 'billsCapped' from o3), 'true'::jsonb, 'O3 capped');

-- ---- O4: side hustle 15,000, it varies, save for something
create temp table o4 as select public.suggest_plan('{"amountMinor":1500000,"frequency":"varies","billsMinor":0,"priority":"goal","kind":"side_hustle","paidInOtherCurrency":false}') as r;
select is((select r -> 'plan' from o4), '{"living":50,"rent":0,"fun":5,"emergency":10,"invest":5,"sinking":19,"tax":6,"buffer":5}'::jsonb, 'O4 plan');
select is((select r -> 'planB' from o4), '{"living":50,"rent":0,"fun":5,"emergency":5,"invest":10,"sinking":19,"tax":6,"buffer":5}'::jsonb, 'O4 Plan B offered: Emergency 5, Investments 10');

-- ---- presets, Plan B only when Emergency >= 10, always totals 100, defaults
select is(public.suggest_plan('{"amountMinor":2500000,"frequency":"monthly","billsMinor":0,"priority":"safety","kind":"salary","preset":"fifty_thirty_twenty"}') -> 'plan',
  '{"living":50,"rent":0,"fun":30,"emergency":10,"invest":5,"sinking":5,"tax":0,"buffer":0}'::jsonb, '50/30/20 preset');
select is(public.suggest_plan('{"amountMinor":2500000,"frequency":"monthly","billsMinor":0,"priority":"safety","kind":"salary","preset":"simple"}') -> 'plan',
  '{"living":60,"rent":0,"fun":20,"emergency":20,"invest":0,"sinking":0,"tax":0,"buffer":0}'::jsonb, 'Simple preset');
select is(public.suggest_plan('{"amountMinor":2500000,"frequency":"monthly","billsMinor":500000,"priority":"safety","kind":"salary","preset":"simple"}') -> 'plan' ->> 'living', '40', 'Simple preset: Living 60 minus bills 20');
select is(public.suggest_plan('{"amountMinor":2500000,"frequency":"monthly","billsMinor":0,"priority":"safety","kind":"salary"}') -> 'plan' ->> 'emergency', '25', 'preset defaults to suggested');
select is(public.suggest_plan('{"amountMinor":2500000,"frequency":"monthly","priority":"goal","kind":"salary","preset":"fifty_thirty_twenty"}') -> 'planB' ->> 'invest', '10', 'bills and currency default to none; Plan B from Emergency 10 -> Invest 10');
select is(public.suggest_plan('{"amountMinor":2500000,"frequency":"monthly","billsMinor":0,"priority":"grow","kind":"salary","preset":"suggested"}') -> 'planB' ->> 'emergency', '5', 'grow: Emergency 10 still offers Plan B');
select is(public.suggest_plan('{"amountMinor":2500000,"frequency":"monthly","billsMinor":0,"priority":"safety","kind":"salary","preset":"simple"}') -> 'planB' ->> 'invest', '15', 'simple: Plan B moves 15 to Investments');

-- ---- edge amounts: tiny and huge pay, zero pay with bills
select is((public.suggest_plan('{"amountMinor":0,"frequency":"monthly","billsMinor":500000,"priority":"safety","kind":"salary"}') ->> 'billsPct')::int, 0, 'zero pay: no division by zero, bills 0%');
select is((select sum(v::int) from jsonb_each_text(public.suggest_plan('{"amountMinor":1,"frequency":"weekly","billsMinor":1000000000,"priority":"control","kind":"side_hustle","paidInOtherCurrency":true}') -> 'plan') e(k, v)),
  100::bigint, 'one centavo pay with giant bills: still totals 100');
select is((public.suggest_plan('{"amountMinor":1000000000,"frequency":"weekly","billsMinor":1000000000,"priority":"grow","kind":"salary"}') ->> 'monthlyMinor')::bigint, 4333333333::bigint, 'PHP 10,000,000 weekly: monthly in integer math');
select is((public.suggest_plan('{"amountMinor":10000,"frequency":"monthly","billsMinor":0,"priority":"safety","kind":"salary"}') ->> 'targetMinor')::bigint, 100000::bigint, 'target has a PHP 1,000 minimum');

-- ---- refused input: 22023 with a message
select throws_ok($$select public.suggest_plan('{"amountMinor":-5,"frequency":"monthly","priority":"safety","kind":"salary"}')$$, '22023', null, 'negative amount refused');
select throws_ok($$select public.suggest_plan('{"amountMinor":12.5,"frequency":"monthly","priority":"safety","kind":"salary"}')$$, '22023', null, 'fractional centavos refused');
select throws_like($$select public.suggest_plan('{"amountMinor":100,"frequency":"daily","priority":"safety","kind":"salary"}')$$, '%How often%', 'unknown frequency names the field');
select throws_ok($$select public.suggest_plan('[]')$$, '22023', null, 'not an object refused');
select throws_ok($$select public.suggest_plan('{"amountMinor":100,"frequency":"monthly","priority":"safety"}')$$, '22023', null, 'missing kind refused');

select * from finish();
rollback;
