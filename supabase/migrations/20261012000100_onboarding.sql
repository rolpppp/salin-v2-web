-- =============================================================================
-- Onboarding SQL (tickets 16 + 18, SPEC 7, BUSINESS_RULES 12, DECISIONS P-8).
--
--   suggest_plan(p_inputs jsonb)  -> jsonb   BR 12.1-12.2, pure; mirrors lib/money/suggest.ts suggestPlan()
--   finish_onboarding(p_draft)    -> jsonb   one transaction, idempotent per user; returns the Done-card summary
--   apply_plan_only(p_draft)      -> void    "Make a plan" after just tracking (BR 12.7)
--
-- The draft is the jsonb shape of lib/onboarding/draft.ts (version 1). Validation errors are errcode 22023 with a
-- human message; another user's account / category / entry id is 42501 ("not found or not yours", no leak).
--
-- Rules followed (engine migration): SECURITY INVOKER (RLS applies), search_path = public, auth.uid() ownership checks
-- (cross-user ids are not FK-guarded), integer math only (bigint, explicit half-up rounding as in lib/money/core.ts),
-- soft delete only, mobile-valid rows only (camelCase, integer enums in Dart order, ms timestamps, syncStatus 2),
-- no triggers on mobile tables (P-5), never touches allocations except through confirm_incomes().
--
-- Decisions made here (see report): Emergency bucket always exists (the engine needs one even at 0%); the Plan B
-- switch rule and the goal's isPlanSwitch flag exist only when Plan B is on; default web-path expense categories are
-- listed in onb_default_categories().
-- =============================================================================

-- ---------------------------------------------------------------- small pure helpers

create or replace function public.onb_present(p jsonb)
returns boolean language sql immutable set search_path = public
as $$ select p is not null and jsonb_typeof(p) <> 'null' $$;

create or replace function public.onb_int(p jsonb, p_what text, p_min bigint, p_max bigint)
returns bigint language plpgsql immutable set search_path = public
as $$
declare v numeric;
begin
  if p is null or jsonb_typeof(p) <> 'number' then
    raise exception '% must be a whole number from % to %', p_what, p_min, p_max using errcode = '22023';
  end if;
  v := (p #>> '{}')::numeric;
  if v <> trunc(v) or v < p_min or v > p_max then
    raise exception '% must be a whole number from % to %', p_what, p_min, p_max using errcode = '22023';
  end if;
  return v::bigint;
end;
$$;

create or replace function public.onb_bool(p jsonb, p_what text)
returns boolean language plpgsql immutable set search_path = public
as $$
begin
  if p is null or jsonb_typeof(p) <> 'boolean' then
    raise exception '% must be true or false', p_what using errcode = '22023';
  end if;
  return (p #>> '{}')::boolean;
end;
$$;

create or replace function public.onb_text(p jsonb, p_what text, p_allowed text[])
returns text language plpgsql immutable set search_path = public
as $$
begin
  if p is null or jsonb_typeof(p) <> 'string' or not ((p #>> '{}') = any (p_allowed)) then
    raise exception '% must be one of: %', p_what, array_to_string(p_allowed, ', ') using errcode = '22023';
  end if;
  return p #>> '{}';
end;
$$;

-- A trimmed string of p_min..p_max characters.
create or replace function public.onb_str(p jsonb, p_what text, p_min int, p_max int)
returns text language plpgsql immutable set search_path = public
as $$
declare v text;
begin
  if p is null or jsonb_typeof(p) <> 'string' then
    raise exception '% is required', p_what using errcode = '22023';
  end if;
  v := btrim(p #>> '{}');
  if char_length(v) < p_min or char_length(v) > p_max then
    raise exception '% must be % to % characters', p_what, p_min, p_max using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function public.onb_date(p jsonb, p_what text)
returns date language plpgsql immutable set search_path = public
as $$
begin
  if p is null or jsonb_typeof(p) <> 'string' or (p #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '% must be a date like 2026-10-21', p_what using errcode = '22023';
  end if;
  begin
    return (p #>> '{}')::date;
  exception when others then
    raise exception '% is not a real date', p_what using errcode = '22023';
  end;
end;
$$;

-- round_half_up(a * n / d) for a >= 0 (lib/money/core.ts mulDivRound).
create or replace function public.onb_mul_div_round(a bigint, n bigint, d bigint)
returns bigint language sql immutable set search_path = public
as $$ select (2 * a * n + d) / (2 * d) $$;

-- ceil(a / b) for a >= 0, b > 0.
create or replace function public.onb_ceil_div(a bigint, b bigint)
returns bigint language sql immutable set search_path = public
as $$ select (a + b - 1) / b $$;

-- M = round(A x f): monthly x1, twice x2, every 2 weeks x26/12, weekly x52/12, varies x1.
create or replace function public.onb_monthly(p_amount bigint, p_frequency text)
returns bigint language sql immutable set search_path = public
as $$
  select public.onb_mul_div_round(p_amount,
    case p_frequency when 'twice' then 2 when 'biweekly' then 26 when 'weekly' then 52 else 1 end,
    case p_frequency when 'biweekly' then 12 when 'weekly' then 12 else 1 end)
$$;

-- BR 12.2: ceil(3 x round(M x (Living% + Bills%) / 100) / PHP 1,000) x PHP 1,000, minimum PHP 1,000.
create or replace function public.onb_safety_target(p_monthly bigint, p_living int, p_bills int)
returns bigint language sql immutable set search_path = public
as $$
  select greatest(100000::bigint,
    public.onb_ceil_div(public.onb_mul_div_round(p_monthly, (p_living + p_bills)::bigint, 100) * 3, 100000) * 100000)
$$;

-- Plan B (BR 12.1.6): Emergency 5%, the difference to Investments; only when Emergency >= 10. Arrays are in plan order:
-- 1 living, 2 rent, 3 fun, 4 emergency, 5 invest, 6 sinking, 7 tax, 8 buffer.
create or replace function public.onb_plan_b(p_a int[])
returns int[] language plpgsql immutable set search_path = public
as $$
declare b int[] := p_a;
begin
  if p_a[4] < 10 then return null; end if;
  b[5] := p_a[5] + p_a[4] - 5;
  b[4] := 5;
  return b;
end;
$$;

create or replace function public.onb_plan_json(p int[])
returns jsonb language sql immutable set search_path = public
as $$
  select jsonb_build_object('living', p[1], 'rent', p[2], 'fun', p[3], 'emergency', p[4],
                            'invest', p[5], 'sinking', p[6], 'tax', p[7], 'buffer', p[8])
$$;

-- ---------------------------------------------------------------- suggest_plan (BR 12.1, 12.2)

-- Input (SuggestPlanInput): amountMinor, frequency, billsMinor (default 0), priority, kind, paidInOtherCurrency
-- (default false), preset (default "suggested"). Output: SuggestedPlan plus targetMinor.
create or replace function public.suggest_plan(p_inputs jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = public
as $$
declare
  v_amount bigint; v_bills bigint; v_freq text; v_pri text; v_kind text; v_other boolean; v_preset text;
  v_m bigint; v_raw bigint := 0; v_pct int; v_capped boolean; v_covered bigint;
  p int[] := array[0, 0, 0, 0, 0, 0, 0, 0];
  v_trim_k int[] := array[3, 6, 5, 4, 1, 3, 6, 4];   -- fun, sinking, invest, emergency, living, fun, sinking, emergency
  v_trim_f int[] := array[5, 5, 0, 5, 10, 0, 0, 0];
  v_over int; v_take int; i int;
  v_b int[];
begin
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'object' then
    raise exception 'suggest_plan needs a json object' using errcode = '22023';
  end if;
  v_amount := public.onb_int(p_inputs -> 'amountMinor', 'Pay amount', 0, 1000000000);
  v_bills := case when public.onb_present(p_inputs -> 'billsMinor')
                  then public.onb_int(p_inputs -> 'billsMinor', 'Monthly bills', 0, 1000000000) else 0 end;
  v_freq := public.onb_text(p_inputs -> 'frequency', 'How often', array['monthly', 'twice', 'biweekly', 'weekly', 'varies']);
  v_pri := public.onb_text(p_inputs -> 'priority', 'Priority', array['safety', 'goal', 'grow', 'control']);
  v_kind := public.onb_text(p_inputs -> 'kind', 'Income kind', array['salary', 'side_hustle', 'scholarship', 'allowance']);
  v_other := case when public.onb_present(p_inputs -> 'paidInOtherCurrency')
                  then public.onb_bool(p_inputs -> 'paidInOtherCurrency', 'Paid in another currency') else false end;
  v_preset := case when public.onb_present(p_inputs -> 'preset')
                   then public.onb_text(p_inputs -> 'preset', 'Preset', array['suggested', 'fifty_thirty_twenty', 'simple']) else 'suggested' end;

  v_m := public.onb_monthly(v_amount, v_freq);
  if v_bills > 0 and v_m > 0 then v_raw := public.onb_ceil_div(v_bills * 100, v_m); end if;
  v_pct := case when v_bills > 0 then least(45, v_raw)::int else 0 end;
  v_capped := v_raw > 45;
  p[2] := v_pct;

  if v_preset = 'fifty_thirty_twenty' then
    p[1] := greatest(10, 50 - v_pct); p[3] := 30; p[4] := 10; p[5] := 5; p[6] := 5;
  elsif v_preset = 'simple' then
    p[1] := greatest(10, 60 - v_pct); p[3] := 20; p[4] := 20; p[5] := 0; p[6] := 0;
  else
    p[1] := greatest(10, 50 - v_pct);
    -- fun, emergency, invest, sinking
    case v_pri
      when 'safety'  then p[3] := 10; p[4] := 25; p[5] := 5;  p[6] := 10;
      when 'goal'    then p[3] := 10; p[4] := 10; p[5] := 5;  p[6] := 25;
      when 'grow'    then p[3] := 10; p[4] := 10; p[5] := 25; p[6] := 5;
      else                p[3] := 20; p[4] := 15; p[5] := 5;  p[6] := 10;
    end case;
  end if;
  p[7] := case when v_kind = 'side_hustle' or v_other then 6 else 0 end;
  p[8] := case when v_other then 3 when v_freq = 'varies' then 5 else 0 end;

  v_over := (select sum(x) from unnest(p) x) - 100;
  for i in 1 .. 8 loop
    exit when v_over <= 0;
    v_take := least(v_over, greatest(0, p[v_trim_k[i]] - v_trim_f[i]));
    p[v_trim_k[i]] := p[v_trim_k[i]] - v_take;
    v_over := v_over - v_take;
  end loop;
  if v_over < 0 then p[4] := p[4] - v_over; end if;

  v_covered := public.onb_mul_div_round(v_m, v_pct, 100);
  v_b := public.onb_plan_b(p);
  return jsonb_build_object(
    'monthlyMinor', v_m,
    'billsPct', v_pct,
    'billsCapped', v_capped,
    'billsCoveredMinor', v_covered,
    'billsWarning', case when v_capped and v_covered < v_bills
                         then jsonb_build_object('coveredMinor', v_covered, 'billsMinor', v_bills) else null end,
    'plan', public.onb_plan_json(p),
    'planB', case when v_b is null then null else public.onb_plan_json(v_b) end,
    'targetMinor', public.onb_safety_target(v_m, p[1], p[2]));
end;
$$;

-- ---------------------------------------------------------------- draft reading and validation

-- Whole percents of a plan object, in plan order, all eight keys required, each 0..100, total exactly 100.
create or replace function public.onb_pcts(p jsonb, p_what text)
returns int[] language plpgsql immutable set search_path = public
as $$
declare
  v_keys text[] := array['living', 'rent', 'fun', 'emergency', 'invest', 'sinking', 'tax', 'buffer'];
  v int[] := array[]::int[];
  i int;
  v_total int;
begin
  if p is null or coalesce(jsonb_typeof(p), '') <> 'object' then
    raise exception '% is missing', p_what using errcode = '22023';
  end if;
  for i in 1 .. 8 loop
    v := v || public.onb_int(p -> v_keys[i], p_what || ' ' || v_keys[i], 0, 100)::int;
  end loop;
  v_total := (select sum(x) from unnest(v) x);
  if v_total <> 100 then
    raise exception '% adds up to % percent. It must add up to 100.', p_what, v_total using errcode = '22023';
  end if;
  return v;
end;
$$;

-- Plan A in plan order. Just track (skipped): Living 100.
create or replace function public.onb_plan_a(p_d jsonb)
returns int[] language sql immutable set search_path = public
as $$
  select case when (p_d ->> 'skipped')::boolean then array[100, 0, 0, 0, 0, 0, 0, 0]
              else public.onb_pcts(p_d -> 'planA', 'Your plan') end
$$;

create or replace function public.onb_account_type(p text)
returns bigint language sql immutable set search_path = public
as $$ select case p when 'cash' then 0 when 'bank' then 1 when 'savings' then 2 when 'eWallet' then 3
                    when 'creditCard' then 4 when 'debitCard' then 5 else 6 end::bigint $$;

create or replace function public.onb_bill_label(p text)
returns text language sql immutable set search_path = public
as $$ select case p when 'rent' then 'Rent' when 'tuition' then 'Tuition' when 'utilities' then 'Utilities'
                    when 'internet' then 'Internet' when 'loan' then 'Loan' else 'Bills' end $$;

-- BR 12.1.1: the Rent bucket is named after the one bill kind picked, else "Bills".
create or replace function public.onb_rent_name(p_kinds jsonb)
returns text language sql immutable set search_path = public
as $$
  select case when p_kinds is not null and jsonb_typeof(p_kinds) = 'array' and jsonb_array_length(p_kinds) = 1
              then public.onb_bill_label(p_kinds ->> 0) else 'Bills' end
$$;

-- Bucket definitions (name, short name, group, hue, order, planless, note). Order = plan order, Scholarship last.
create or replace function public.onb_bucket_def(p_key text)
returns jsonb language sql immutable set search_path = public
as $$
  select case p_key
    when 'living' then '{"name":"Living","short":"Living","group":"spend","hue":"living","ord":1,"planless":false,"note":"Everyday spending: groceries, food, transport, load."}'::jsonb
    when 'rent' then '{"name":"Bills","short":"Bills","group":"set_aside","hue":"rent","ord":2,"planless":false,"note":"Fixed bills, set aside each payday."}'::jsonb
    when 'fun' then '{"name":"Fun money","short":"Fun","group":"spend","hue":"fun","ord":3,"planless":false,"note":"Spend it, guilt-free."}'::jsonb
    when 'emergency' then '{"name":"Emergency fund","short":"Emergency","group":"save","hue":"emergency","ord":4,"planless":false,"note":"Real emergencies only."}'::jsonb
    when 'invest' then '{"name":"Investments","short":"Invest","group":"save","hue":"invest","ord":5,"planless":false,"note":"Long-term. Hands off."}'::jsonb
    when 'sinking' then '{"name":"Sinking funds","short":"Sinking","group":"save","hue":"sinking","ord":6,"planless":false,"note":"School, gadget, health, gifts."}'::jsonb
    when 'tax' then '{"name":"Tax set-aside","short":"Tax","group":"set_aside","hue":"tax","ord":7,"planless":false,"note":"Set aside for the BIR."}'::jsonb
    when 'buffer' then '{"name":"Buffer","short":"Buffer","group":"set_aside","hue":"buffer","ord":8,"planless":false,"note":"Exchange-rate dips and fees."}'::jsonb
    when 'scholarship' then '{"name":"Scholarship","short":"Scholarship","group":"set_aside","hue":"dost","ord":9,"planless":true,"note":"Scholarship money, kept whole for rent and school."}'::jsonb
  end
$$;

-- BR 12.5 auto-mapping (mirrors lib/money/suggest.ts autoMapCategory): the bucket KEY for a category name. A matched
-- bucket with no share in Plan A, or no match, gives living. Just track: living.
create or replace function public.onb_auto_bucket(p_name text, p_pa int[], p_just_track boolean)
returns text language plpgsql immutable set search_path = public
as $$
declare v text;
begin
  if p_just_track then return 'living'; end if;
  v := case
    when p_name ~* 'grocer|food|lunch|meal|transport|commute|fare|load|data|laundry|utilit|electric|water|medicine|pharm' then 'living'
    when p_name ~* 'rent|tuition|dorm|internet|wifi' then 'rent'
    when p_name ~* 'movie|going out|eating out|shopping|coffee|game|hobb|treat|dining' then 'fun'
    when p_name ~* 'school|gadget|health|gift|travel' then 'sinking'
    when p_name ~* 'tax|bir' then 'tax'
    when p_name ~* 'fee|fx|exchange' then 'buffer'
    else null end;
  if v is null then return 'living'; end if;
  if p_pa[array_position(array['living', 'rent', 'fun', 'emergency', 'invest', 'sinking', 'tax', 'buffer'], v)] > 0 then return v; end if;
  return 'living';
end;
$$;

-- The default expense categories a web-path user gets (no phone data to read them from), per bucket.
-- Names are chosen so BR 12.5 would map them to the same bucket. Bill-kind categories are added from billKinds.
create or replace function public.onb_default_categories()
returns jsonb language sql immutable set search_path = public
as $$
  select '[
    {"b":"living","n":"Groceries"},{"b":"living","n":"Food & lunch"},{"b":"living","n":"Transport"},
    {"b":"living","n":"Load & data"},{"b":"living","n":"Laundry"},{"b":"living","n":"Medicine"},
    {"b":"fun","n":"Eating out"},{"b":"fun","n":"Movies & games"},{"b":"fun","n":"Shopping"},{"b":"fun","n":"Coffee"},
    {"b":"sinking","n":"School"},{"b":"sinking","n":"Gadgets"},{"b":"sinking","n":"Health"},{"b":"sinking","n":"Gifts"},{"b":"sinking","n":"Travel"},
    {"b":"tax","n":"Tax payments"},
    {"b":"buffer","n":"Fees & charges"}
  ]'::jsonb
$$;

-- Shape validation of a draft. p_mode: 'finish' (everything) or 'plan' (Make a plan: only what the plan needs).
-- Pure: no table access. Errors are 22023 with a message a person can act on.
create or replace function public.onb_validate_draft(p_d jsonb, p_mode text)
returns void language plpgsql stable set search_path = public
as $$
declare
  v_path text;
  v_rule text;
  v_skip boolean;
  v_el jsonb;
  v_ids text[] := array[]::text[];
  v_names text[] := array[]::text[];
  v_snames text[] := array[]::text[];
  v_mains int := 0;
  v_k text;
  v_v jsonb;
  v_keys text[] := array['living', 'rent', 'fun', 'emergency', 'invest', 'sinking', 'tax', 'buffer', 'scholarship'];
  v_split jsonb;
  v_choice text;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_d date;
begin
  if p_d is null or jsonb_typeof(p_d) <> 'object' then
    raise exception 'The onboarding draft must be a json object' using errcode = '22023';
  end if;
  if p_d -> 'v' is distinct from to_jsonb(1) then
    raise exception 'This draft is version %, but only version 1 is supported. Start the steps again.', coalesce(p_d ->> 'v', 'unknown') using errcode = '22023';
  end if;
  v_path := public.onb_text(p_d -> 'path', 'Path', array['web', 'app']);
  v_skip := public.onb_bool(p_d -> 'skipped', 'skipped');
  if p_mode = 'finish' and public.onb_bool(p_d -> 'planOnly', 'planOnly') then
    raise exception 'This draft is for Make a plan; use apply_plan_only instead' using errcode = '22023';
  end if;
  if p_mode = 'plan' and v_skip then
    raise exception 'Pick a plan first: just tracking is not a plan' using errcode = '22023';
  end if;

  -- accounts and landing
  if p_mode = 'finish' then
    if coalesce(jsonb_typeof(p_d -> 'accounts'), '') <> 'array' or jsonb_array_length(p_d -> 'accounts') < 1 then
      raise exception 'Add at least one account' using errcode = '22023';
    end if;
    for v_el in select value from jsonb_array_elements(p_d -> 'accounts') loop
      v_k := public.onb_str(v_el -> 'id', 'Account id', 1, 100);
      if v_k = any (v_ids) then raise exception 'Account % appears twice', v_k using errcode = '22023'; end if;
      v_ids := v_ids || v_k;
      v_k := lower(public.onb_str(v_el -> 'name', 'Account name', 1, 60));
      if v_k = any (v_names) then raise exception 'Two accounts are called "%"', public.onb_str(v_el -> 'name', 'Account name', 1, 60) using errcode = '22023'; end if;
      v_names := v_names || v_k;
      perform public.onb_text(v_el -> 'type', 'Account type', array['cash', 'bank', 'savings', 'eWallet', 'creditCard', 'debitCard', 'investment']);
      perform public.onb_text(v_el -> 'currency', 'Account currency', array['PHP', 'AUD', 'USD']);
      perform public.onb_bool(v_el -> 'isNew', 'Account isNew');
    end loop;
  end if;
  if not public.onb_present(p_d -> 'landingAccountId') then
    raise exception 'Pick the account your pay lands in' using errcode = '22023';
  end if;
  v_k := public.onb_str(p_d -> 'landingAccountId', 'Landing account', 1, 100);
  if p_mode = 'finish' and not (v_k = any (v_ids)) then
    raise exception 'The account your pay lands in is not one of your accounts' using errcode = '22023';
  end if;

  -- income
  if coalesce(jsonb_typeof(p_d -> 'income'), '') <> 'object' then raise exception 'Income is missing' using errcode = '22023'; end if;
  if p_mode = 'finish' then
    perform public.onb_text(p_d #> '{income,kind}', 'Income kind', array['salary', 'side_hustle', 'scholarship', 'allowance']);
    perform public.onb_int(p_d #> '{income,amountMinor}', 'Pay amount', 1, 1000000000);
    perform public.onb_text(p_d #> '{income,frequency}', 'How often you are paid', array['monthly', 'twice', 'biweekly', 'weekly', 'varies']);
    perform public.onb_date(p_d #> '{income,nextPayday}', 'Next payday');
    perform public.onb_bool(p_d #> '{income,paidInOtherCurrency}', 'Paid in another currency');
    if public.onb_present(p_d -> 'firstName') then perform public.onb_str(p_d -> 'firstName', 'First name', 0, 40); end if;
  end if;

  -- sources
  if p_mode = 'finish' then
    if coalesce(jsonb_typeof(p_d -> 'sources'), '') <> 'array' or jsonb_array_length(p_d -> 'sources') < 1 then
      raise exception 'Add your main pay as an income source' using errcode = '22023';
    end if;
    for v_el in select value from jsonb_array_elements(p_d -> 'sources') loop
      perform public.onb_str(v_el -> 'key', 'Income source key', 1, 100);
      v_k := lower(public.onb_str(v_el -> 'name', 'Income source name', 1, 60));
      if v_k = any (v_snames) then raise exception 'Two income sources are called "%"', public.onb_str(v_el -> 'name', 'Income source name', 1, 60) using errcode = '22023'; end if;
      v_snames := v_snames || v_k;
      perform public.onb_text(v_el -> 'kind', 'Income source kind', array['salary', 'scholarship', 'side_hustle', 'allowance', 'gift', 'refund', 'other']);
      v_rule := public.onb_text(v_el -> 'rule', 'Income source rule', array['plan', 'own', 'whole', 'ask']);
      if public.onb_bool(v_el -> 'isMain', 'isMain') then v_mains := v_mains + 1; end if;
      if v_rule = 'whole' then
        if not public.onb_present(v_el -> 'wholeBucket') then
          raise exception '% is kept whole: pick the bucket it goes to', v_el ->> 'name' using errcode = '22023';
        end if;
        v_k := public.onb_text(v_el -> 'wholeBucket', 'Whole bucket', v_keys);
        if v_k = 'rent' then raise exception 'Rent cannot be used for an income source' using errcode = '22023'; end if;
      end if;
      if v_rule <> 'whole' and public.onb_present(v_el -> 'ownSplit') then
        v_split := v_el -> 'ownSplit';
        if coalesce(jsonb_typeof(v_split), '') <> 'object' then raise exception 'The own split of % is not an object', v_el ->> 'name' using errcode = '22023'; end if;
        for v_k, v_v in select key, value from jsonb_each(v_split) loop
          if not (v_k = any (v_keys[1:8])) then raise exception 'The own split of % names an unknown bucket "%"', v_el ->> 'name', v_k using errcode = '22023'; end if;
          if v_k = 'rent' then raise exception 'Rent cannot be used for an income source' using errcode = '22023'; end if;
          perform public.onb_int(v_v, 'The own split share of ' || (v_el ->> 'name'), 0, 100);
        end loop;
      end if;
    end loop;
    if v_mains <> 1 then raise exception 'Exactly one income source must be the main pay (found %)', v_mains using errcode = '22023'; end if;
  end if;

  -- priorities and plan
  v_k := case when v_skip then null else public.onb_text(p_d -> 'priority', 'Priority', array['safety', 'goal', 'grow', 'control']) end;
  if v_k = 'goal' then
    if coalesce(jsonb_typeof(p_d -> 'goal'), '') <> 'object' then raise exception 'Name the thing you are saving for and what it costs' using errcode = '22023'; end if;
    perform public.onb_str(p_d #> '{goal,name}', 'Goal name', 1, 60);
    perform public.onb_int(p_d #> '{goal,costMinor}', 'Goal cost', 1, 1000000000);
  end if;
  perform public.onb_int(p_d -> 'billsMinor', 'Monthly bills', 0, 1000000000);
  if coalesce(jsonb_typeof(p_d -> 'billKinds'), '') <> 'array' then raise exception 'billKinds must be a list' using errcode = '22023'; end if;
  for v_el in select value from jsonb_array_elements(p_d -> 'billKinds') loop
    perform public.onb_text(v_el, 'Bill kind', array['rent', 'tuition', 'utilities', 'internet', 'loan']);
  end loop;
  if public.onb_present(p_d -> 'billsStart') then perform public.onb_date(p_d -> 'billsStart', 'Bills start date'); end if;
  if not v_skip then
    perform public.onb_pcts(p_d -> 'planA', 'Your plan');
    if public.onb_present(p_d -> 'targetMinor') then perform public.onb_int(p_d -> 'targetMinor', 'Safety-net target', 0, 1000000000); end if;
    perform public.onb_bool(p_d -> 'planBOn', 'planBOn');
  end if;

  -- homes
  if public.onb_present(p_d -> 'homes') then
    if coalesce(jsonb_typeof(p_d -> 'homes'), '') <> 'object' then raise exception 'homes must be an object' using errcode = '22023'; end if;
    for v_k, v_v in select key, value from jsonb_each(p_d -> 'homes') loop
      if not (v_k = any (v_keys)) then raise exception 'homes names an unknown bucket "%"', v_k using errcode = '22023'; end if;
      perform public.onb_str(v_v, 'Home of ' || v_k, 1, 100);
    end loop;
  end if;

  -- categories (app path)
  if public.onb_present(p_d -> 'categories') then
    if coalesce(jsonb_typeof(p_d -> 'categories'), '') <> 'object' then raise exception 'categories must be an object' using errcode = '22023'; end if;
    for v_k, v_v in select key, value from jsonb_each(p_d -> 'categories') loop
      if coalesce(jsonb_typeof(v_v), '') <> 'object' then raise exception 'Category % is not set up correctly', v_k using errcode = '22023'; end if;
      perform public.onb_text(v_v -> 'bucket', 'The bucket of category ' || v_k, v_keys);
      perform public.onb_text(v_v -> 'source', 'The source of category ' || v_k, array['auto', 'user']);
    end loop;
  end if;

  -- first pay
  if p_mode = 'finish' then
    if coalesce(jsonb_typeof(p_d -> 'firstPay'), '') <> 'object' then raise exception 'First pay is missing' using errcode = '22023'; end if;
    perform public.onb_text(p_d #> '{firstPay,reminder}', 'Payday reminder', array['email', 'none']);
    v_choice := case when public.onb_present(p_d #> '{firstPay,choice}')
                     then public.onb_text(p_d #> '{firstPay,choice}', 'First pay choice', array['yes', 'later']) else 'later' end;
    if coalesce(jsonb_typeof(p_d #> '{firstPay,ticked}'), '') <> 'array' then raise exception 'ticked must be a list' using errcode = '22023'; end if;
    for v_el in select value from jsonb_array_elements(p_d #> '{firstPay,ticked}') loop
      perform public.onb_str(v_el -> 'fromAccountId', 'Transfer from', 1, 100);
      perform public.onb_str(v_el -> 'toAccountId', 'Transfer to', 1, 100);
      if v_el ->> 'fromAccountId' = v_el ->> 'toAccountId' then raise exception 'A transfer needs two different accounts' using errcode = '22023'; end if;
    end loop;
    if v_choice = 'yes' and public.onb_bool(p_d #> '{firstPay,splitConfirmed}', 'splitConfirmed') then
      perform public.onb_str(p_d #> '{firstPay,entryId}', 'First pay entry', 1, 100);
      if v_path = 'web' then
        perform public.onb_int(p_d #> '{firstPay,amountMinor}', 'First pay amount', 1, 1000000000);
        v_d := public.onb_date(p_d #> '{firstPay,date}', 'First pay date');
        if v_d > v_today then raise exception 'The first pay date cannot be in the future' using errcode = '22023'; end if;
      end if;
    elsif jsonb_array_length(p_d #> '{firstPay,ticked}') > 0 then
      raise exception 'Transfers can only be ticked after the split is confirmed' using errcode = '22023';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------- accounts (create isNew ones, check every reference)

-- Web-path accounts are created here with mobile-valid rows (same shape as lib/domain/mobile newAccountRow);
-- an id that already exists for this user is skipped (idempotent). Every account id the draft refers to must be
-- the caller's own live account: another user's id gives 42501 "not found or not yours".
create or replace function public.onb_ensure_accounts(p_user uuid, p_d jsonb, p_mode text)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_now bigint := public.now_ms();
  v_el jsonb;
  v_i bigint;
  v_id text;
  v_ref text;
begin
  if p_mode = 'finish' then
    for v_el, v_i in select t.value, t.ord from jsonb_array_elements(p_d -> 'accounts') with ordinality as t(value, ord) loop
      v_id := v_el ->> 'id';
      if (v_el ->> 'isNew')::boolean
         and not exists (select 1 from public.accounts a where a.id = v_id and a.user_id = p_user) then
        if exists (select 1 from public.accounts a where a.user_id = p_user and a."deletedAt" is null
                    and lower(btrim(a.name)) = lower(btrim(v_el ->> 'name'))) then
          raise exception 'You already have an account called "%". Use it instead of adding it again.', btrim(v_el ->> 'name') using errcode = '22023';
        end if;
        -- on conflict do nothing: an id owned by someone else is invisible to us, so the check below catches it
        insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, color,
                                     "displayOrder", "isArchived", "createdAt", "updatedAt", "deletedAt", "syncStatus")
        values (v_id, p_user, btrim(v_el ->> 'name'), public.onb_account_type(v_el ->> 'type'), 0, v_el ->> 'currency',
                'default_icon', null, v_now + v_i, false, v_now, v_now, null, 2)
        on conflict (id) do nothing;
      end if;
      if not exists (select 1 from public.accounts a where a.id = v_id and a.user_id = p_user and a."deletedAt" is null) then
        raise exception 'account % not found or not yours', v_id using errcode = '42501';
      end if;
    end loop;
  end if;

  for v_ref in
    select distinct x.r from (
      select p_d ->> 'landingAccountId' as r
      union all select h.value #>> '{}' from jsonb_each(coalesce(nullif(p_d -> 'homes', 'null'::jsonb), '{}'::jsonb)) h
      union all select s ->> 'landsInAccountId' from jsonb_array_elements(case when p_mode = 'finish' then p_d -> 'sources' else '[]'::jsonb end) s
      union all select t ->> 'fromAccountId' from jsonb_array_elements(case when p_mode = 'finish' then p_d #> '{firstPay,ticked}' else '[]'::jsonb end) t
      union all select t ->> 'toAccountId' from jsonb_array_elements(case when p_mode = 'finish' then p_d #> '{firstPay,ticked}' else '[]'::jsonb end) t
    ) x where x.r is not null
  loop
    if not exists (select 1 from public.accounts a where a.id = v_ref and a.user_id = p_user and a."deletedAt" is null and not a."isArchived") then
      raise exception 'account % not found or not yours', v_ref using errcode = '42501';
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- buckets, plans, rules, goals (shared by finish + plan-only)

-- Returns {bucketKey: bucketId}. p_mode 'finish' also reads sources (whole / own-split buckets, scholarship);
-- 'plan' leaves buckets that are not in the plan alone. Never touches allocations, income sources or existing goals.
create or replace function public.onb_apply_plan(p_user uuid, p_d jsonb, p_mode text)
returns jsonb language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_keys text[] := array['living', 'rent', 'fun', 'emergency', 'invest', 'sinking', 'tax', 'buffer'];
  v_skip boolean := (p_d ->> 'skipped')::boolean;
  v_now bigint := public.now_ms();
  v_land text := p_d ->> 'landingAccountId';
  pa int[] := public.onb_plan_a(p_d);
  pb int[];
  v_need text[] := array['living', 'buffer', 'emergency'];
  v_ids jsonb := '{}'::jsonb;
  v_def jsonb;
  v_key text;
  v_el jsonb;
  v_k2 text;
  v_v jsonb;
  v_i int;
  v_home text;
  v_name text;
  v_b record;
  v_id uuid;
  v_plan uuid;
  v_lines jsonb;
  v_em uuid;
  v_rent uuid;
  v_target bigint;
  v_pri text := case when v_skip then null else p_d ->> 'priority' end;
  v_params jsonb;
begin
  if not v_skip and (p_d ->> 'planBOn')::boolean then pb := public.onb_plan_b(pa); end if;

  -- which buckets exist after this call
  for v_i in 1 .. 8 loop
    if (pa[v_i] > 0 or (pb is not null and pb[v_i] > 0)) and not (v_keys[v_i] = any (v_need)) then v_need := v_need || v_keys[v_i]; end if;
  end loop;
  if p_mode = 'finish' then
    for v_el in select value from jsonb_array_elements(p_d -> 'sources') loop
      if v_el ->> 'kind' = 'scholarship' and not ('scholarship' = any (v_need)) then v_need := v_need || 'scholarship'; end if;
      if v_el ->> 'rule' = 'whole' and not ((v_el ->> 'wholeBucket') = any (v_need)) then v_need := v_need || (v_el ->> 'wholeBucket'); end if;
      if v_el ->> 'rule' = 'own' and public.onb_present(v_el -> 'ownSplit') then
        for v_k2, v_v in select key, value from jsonb_each(v_el -> 'ownSplit') loop
          if (v_v #>> '{}')::int > 0 and not (v_k2 = any (v_need)) then v_need := v_need || v_k2; end if;
        end loop;
      end if;
    end loop;
  end if;

  -- buckets: found by hue (live, not archived) or created; homes from the draft, else where pay lands
  foreach v_key in array array['living', 'rent', 'fun', 'emergency', 'invest', 'sinking', 'tax', 'buffer', 'scholarship'] loop
    continue when not (v_key = any (v_need));
    v_def := public.onb_bucket_def(v_key);
    v_home := case when v_skip then v_land else coalesce(p_d -> 'homes' ->> v_key, v_land) end;
    v_name := case v_key when 'rent' then public.onb_rent_name(p_d -> 'billKinds')
                         when 'living' then case when v_skip then 'Spending' else 'Living' end
                         else v_def ->> 'name' end;
    select b.id, b.name into v_b from public.buckets b
     where b.user_id = p_user and b.hue = v_def ->> 'hue' and b."deletedAt" is null and not b."isArchived"
     order by b."displayOrder", b.id limit 1;
    if v_b.id is null then
      insert into public.buckets (user_id, name, "shortName", "groupKey", hue, note, "keptInAccountId", planless, "displayOrder", "createdAt", "updatedAt")
      values (p_user, v_name, case when v_key in ('rent', 'living') then v_name else v_def ->> 'short' end,
              v_def ->> 'group', v_def ->> 'hue',
              case when v_key = 'living' and v_skip then 'Everything you get goes here until you make a plan.' else v_def ->> 'note' end,
              v_home, (v_def ->> 'planless')::boolean, (v_def ->> 'ord')::bigint, v_now, v_now)
      returning id into v_id;
    else
      v_id := v_b.id;
      -- a name the person typed stays; only the names this flow itself gives are switched
      update public.buckets
         set "keptInAccountId" = v_home,
             name = case when v_key in ('living', 'rent')
                          and v_b.name = any (array['Living', 'Spending', 'Rent', 'Bills', 'Tuition', 'Utilities', 'Internet', 'Loan'])
                         then v_name else v_b.name end,
             "updatedAt" = v_now
       where id = v_id;
    end if;
    v_ids := v_ids || jsonb_build_object(v_key, v_id);
  end loop;
  v_em := (v_ids ->> 'emergency')::uuid;
  v_rent := (v_ids ->> 'rent')::uuid;

  -- plans: A (and B when on and offered) as lines in bp; every created non-planless bucket gets a line (0 allowed)
  foreach v_k2 in array array['A', 'B'] loop
    continue when v_k2 = 'B' and pb is null;
    select id into v_plan from public.allocation_plans where user_id = p_user and key = v_k2 and "deletedAt" is null;
    if v_plan is null then
      insert into public.allocation_plans (user_id, key, name, priority, "createdAt", "updatedAt")
      values (p_user, v_k2, 'Plan ' || v_k2, v_pri, v_now, v_now);
    else
      update public.allocation_plans set priority = v_pri, "updatedAt" = v_now where id = v_plan;
    end if;
    v_lines := '[]'::jsonb;
    for v_i in 1 .. 8 loop
      continue when not (v_keys[v_i] = any (v_need));
      v_lines := v_lines || jsonb_build_object('bucketId', v_ids ->> v_keys[v_i],
                                               'percentBp', (case when v_k2 = 'A' then pa[v_i] else pb[v_i] end) * 100);
    end loop;
    perform public.save_plan_lines(v_k2, v_lines);
  end loop;

  -- the safety-net target (Plan B switch = Emergency goal): the draft's, else BR 12.2 from the income
  if not v_skip then
    v_target := case when public.onb_present(p_d -> 'targetMinor') and (p_d ->> 'targetMinor')::bigint > 0
                     then (p_d ->> 'targetMinor')::bigint
                     else public.onb_safety_target(
                            public.onb_monthly(public.onb_int(p_d #> '{income,amountMinor}', 'Pay amount', 1, 1000000000),
                                               public.onb_text(p_d #> '{income,frequency}', 'How often you are paid', array['monthly', 'twice', 'biweekly', 'weekly', 'varies'])),
                            pa[1], pa[2]) end;
  end if;

  -- rules: switch (Plan B on), rent redirect (bills start later)
  if pb is not null then
    v_params := jsonb_build_object('fromPlan', 'A', 'toPlan', 'B', 'bucketId', v_em, 'targetMinor', v_target);
    update public.allocation_rules set params = v_params, "updatedAt" = v_now
     where user_id = p_user and kind = 'switch_on_goal' and "deletedAt" is null;
    if not found then
      insert into public.allocation_rules (user_id, kind, params, "createdAt", "updatedAt") values (p_user, 'switch_on_goal', v_params, v_now, v_now);
    end if;
  else
    update public.allocation_rules set "deletedAt" = v_now, "updatedAt" = v_now
     where user_id = p_user and kind = 'switch_on_goal' and "deletedAt" is null;
  end if;
  if not v_skip and public.onb_present(p_d -> 'billsStart') and v_rent is not null then
    v_params := jsonb_build_object('fromBucketId', v_rent, 'toBucketId', v_em, 'untilDate', p_d ->> 'billsStart');
    update public.allocation_rules set params = v_params, "updatedAt" = v_now
     where user_id = p_user and kind = 'redirect_until_date' and "deletedAt" is null;
    if not found then
      insert into public.allocation_rules (user_id, kind, params, "createdAt", "updatedAt") values (p_user, 'redirect_until_date', v_params, v_now, v_now);
    end if;
  else
    update public.allocation_rules set "deletedAt" = v_now, "updatedAt" = v_now
     where user_id = p_user and kind = 'redirect_until_date' and "deletedAt" is null;
  end if;

  -- goals: Emergency fund (the switch goal) unless just tracking; the "save for something" goal linked to Sinking.
  -- An existing goal is never changed.
  if not v_skip then
    if not exists (select 1 from public.goals g where g.user_id = p_user and g."deletedAt" is null
                    and (g."isPlanSwitch" or lower(btrim(g.name)) = 'emergency fund')) then
      insert into public.goals (user_id, name, "targetMinor", "linkedBucketId", "linkedShareBp", "isPlanSwitch", "createdAt", "updatedAt")
      values (p_user, 'Emergency fund', v_target, v_em, 10000, pb is not null, v_now, v_now);
    end if;
    if v_pri = 'goal' and not exists (select 1 from public.goals g where g.user_id = p_user and g."deletedAt" is null
                                       and lower(btrim(g.name)) = lower(btrim(p_d #>> '{goal,name}'))) then
      insert into public.goals (user_id, name, "targetMinor", "linkedBucketId", "linkedShareBp", "createdAt", "updatedAt")
      values (p_user, btrim(p_d #>> '{goal,name}'), (p_d #>> '{goal,costMinor}')::bigint, (v_ids ->> 'sinking')::uuid, 10000, v_now, v_now);
    end if;
  end if;
  return v_ids;
end;
$$;

-- ---------------------------------------------------------------- income sources (finish only)

-- Creates (or updates, matched by income category) every source with its rule, own split, whole bucket and landing
-- account, plus the income category the web path needs. Returns {sourceId, categoryId, landsIn} of the main pay.
create or replace function public.onb_apply_sources(p_user uuid, p_d jsonb, p_ids jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_now bigint := public.now_ms();
  v_land text := p_d ->> 'landingAccountId';
  v_el jsonb;
  v_cat text;
  v_src uuid;
  v_whole uuid;
  v_lands text;
  v_k text;
  v_v jsonb;
  v_n bigint := 0;
  v_main jsonb := '{}'::jsonb;
begin
  for v_el in select value from jsonb_array_elements(p_d -> 'sources') loop
    v_n := v_n + 1;
    v_lands := coalesce(v_el ->> 'landsInAccountId', v_land);
    v_whole := case when v_el ->> 'rule' = 'whole' then (p_ids ->> (v_el ->> 'wholeBucket'))::uuid end;

    -- income category (mobile `categories`, categoryType 0)
    v_cat := v_el ->> 'categoryId';
    if v_cat is not null then
      if not exists (select 1 from public.categories c where c.id = v_cat and c.user_id = p_user and c."deletedAt" is null and c."categoryType" = 0) then
        raise exception 'income category % not found or not yours', v_cat using errcode = '42501';
      end if;
    else
      select c.id into v_cat from public.categories c
       where c.user_id = p_user and c."deletedAt" is null and c."categoryType" = 0 and lower(c.name) = lower(btrim(v_el ->> 'name'))
         and not exists (select 1 from public.income_sources s where s.user_id = p_user and s."deletedAt" is null and s."categoryId" = c.id)
       order by c."displayOrder", c.id limit 1;
      if v_cat is null then
        v_cat := gen_random_uuid()::text;
        insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "deletedAt", "syncStatus")
        values (v_cat, p_user, btrim(v_el ->> 'name'), 'category', '#2E6EA6', 0, false, v_now + v_n, v_now, v_now, null, 2);
      end if;
    end if;

    select s.id into v_src from public.income_sources s
     where s.user_id = p_user and s."deletedAt" is null and s."categoryId" = v_cat order by s."createdAt", s.id limit 1;
    if v_src is null then
      insert into public.income_sources (user_id, name, kind, rule, "wholeBucketId", "landsInAccountId", "categoryId", "createdAt", "updatedAt")
      values (p_user, btrim(v_el ->> 'name'), v_el ->> 'kind', v_el ->> 'rule', v_whole, v_lands, v_cat, v_now, v_now)
      returning id into v_src;
    else
      update public.income_sources
         set name = btrim(v_el ->> 'name'), kind = v_el ->> 'kind', rule = v_el ->> 'rule', "wholeBucketId" = v_whole,
             "landsInAccountId" = v_lands, "isArchived" = false, "updatedAt" = v_now
       where id = v_src;
      update public.income_source_split_lines set "deletedAt" = v_now, "updatedAt" = v_now
       where "sourceId" = v_src and user_id = p_user and "deletedAt" is null;
    end if;

    -- own split: whole percents -> bp; may total != 100 (then its incomes need a job, BR 2.1.4)
    if v_el ->> 'rule' = 'own' and public.onb_present(v_el -> 'ownSplit') then
      for v_k, v_v in select key, value from jsonb_each(v_el -> 'ownSplit') loop
        if (v_v #>> '{}')::int > 0 then
          insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp", "createdAt", "updatedAt")
          values (p_user, v_src, (p_ids ->> v_k)::uuid, (v_v #>> '{}')::int * 100, v_now, v_now);
        end if;
      end loop;
    end if;

    if (v_el ->> 'isMain')::boolean then
      v_main := jsonb_build_object('sourceId', v_src, 'categoryId', v_cat, 'landsIn', v_lands);
    end if;
  end loop;
  return v_main;
end;
$$;

-- ---------------------------------------------------------------- expense categories -> buckets

-- Maps a category (never moves a user-set mapping). p_since: entries logged on/after it that have no bucket snapshot
-- yet are frozen in the OLD bucket before a move (BR 4.1); null = no freezing.
create or replace function public.onb_map_category(p_user uuid, p_cat text, p_bucket uuid, p_source text, p_since bigint)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_old record;
  v_now bigint := public.now_ms();
begin
  select cb."bucketId" as bucket_id, cb.source as src, cb."deletedAt" as deleted_at into v_old from public.category_buckets cb
   where cb.user_id = p_user and cb."categoryId" = p_cat;
  if found then
    if v_old.deleted_at is null and (v_old.src = 'user' or (v_old.bucket_id = p_bucket and v_old.src = p_source)) then return; end if;
    if v_old.deleted_at is null and v_old.bucket_id <> p_bucket and p_since is not null then
      insert into public.entry_buckets (user_id, "ledgerEntryId", "bucketId", source)
      select le.user_id, le.id, v_old.bucket_id, 'category'
        from public.ledger_entries le
       where le.user_id = p_user and le."categoryId" = p_cat and le.direction = 1 and le.origin <> 3 and le."deletedAt" is null
         and le."occurredAt" >= p_since
      on conflict (user_id, "ledgerEntryId") do nothing;
    end if;
    update public.category_buckets
       set "bucketId" = p_bucket, source = p_source, "deletedAt" = null, "updatedAt" = v_now
     where user_id = p_user and "categoryId" = p_cat;
  else
    insert into public.category_buckets (user_id, "categoryId", "bucketId", source, "createdAt", "updatedAt")
    values (p_user, p_cat, p_bucket, p_source, v_now, v_now);
  end if;
end;
$$;

-- p_mode 'finish': web path gets the default category set (auto); app path maps draft.categories; any live expense
-- category still unmapped is auto-mapped by name (BR 12.5). p_mode 'plan' also re-maps categories whose mapping is
-- still automatic, and never moves a user-set one (BR 12.7). Just track: everything in Living, automatic.
create or replace function public.onb_apply_categories(p_user uuid, p_d jsonb, p_mode text, p_ids jsonb)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_skip boolean := (p_d ->> 'skipped')::boolean;
  v_path text := p_d ->> 'path';
  pa int[] := public.onb_plan_a(p_d);
  v_keys text[] := array['living', 'rent', 'fun', 'emergency', 'invest', 'sinking', 'tax', 'buffer'];
  v_now bigint := public.now_ms();
  v_since bigint := case when p_mode = 'plan' then coalesce((select up."onboardedAt" from public.user_profiles up where up.user_id = p_user), 0) end;
  v_el jsonb;
  v_k text;
  v_v jsonb;
  v_cat text;
  v_bkey text;
  v_n bigint := 0;
  v_handled text[] := array[]::text[];
  c record;
begin
  if p_mode = 'finish' and v_path = 'web' then
    for v_el in
      select d.value from jsonb_array_elements(public.onb_default_categories()) d
      union all
      select jsonb_build_object('b', 'rent', 'n', public.onb_bill_label(k.k)) from jsonb_array_elements_text(p_d -> 'billKinds') k(k)
       where not v_skip
    loop
      v_bkey := v_el ->> 'b';
      -- just track: everyday categories only, all in Living; with a plan: only buckets that have a share
      continue when v_skip and v_bkey not in ('living', 'fun', 'sinking');
      continue when not v_skip and v_bkey <> 'living' and pa[array_position(v_keys, v_bkey)] <= 0;
      v_n := v_n + 1;
      v_cat := null;
      select c2.id into v_cat from public.categories c2
       where c2.user_id = p_user and c2."deletedAt" is null and c2."categoryType" = 1 and lower(c2.name) = lower(v_el ->> 'n') limit 1;
      if v_cat is null then
        v_cat := gen_random_uuid()::text;
        insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "deletedAt", "syncStatus")
        values (v_cat, p_user, v_el ->> 'n', 'category', '#2E6EA6', 1, false, v_now + 1000 + v_n, v_now, v_now, null, 2);
      end if;
      perform public.onb_map_category(p_user, v_cat, (p_ids ->> case when v_skip then 'living' else v_bkey end)::uuid, 'auto', null);
      v_handled := v_handled || v_cat;
    end loop;
  end if;

  -- app path: the sorted list from the draft
  if public.onb_present(p_d -> 'categories') then
    for v_k, v_v in select key, value from jsonb_each(p_d -> 'categories') loop
      if not exists (select 1 from public.categories c2 where c2.id = v_k and c2.user_id = p_user and c2."deletedAt" is null and c2."categoryType" = 1) then
        raise exception 'category % not found or not yours', v_k using errcode = '42501';
      end if;
      v_bkey := case when v_skip then 'living' else v_v ->> 'bucket' end;
      if not (p_ids ? v_bkey) then v_bkey := 'living'; end if;   -- a bucket with no share: back to Living
      perform public.onb_map_category(p_user, v_k, (p_ids ->> v_bkey)::uuid, case when v_skip then 'auto' else v_v ->> 'source' end, v_since);
      v_handled := v_handled || v_k;
    end loop;
  end if;

  -- everything else: unmapped -> by name; plan mode: still-automatic -> re-mapped by name
  for c in
    select cat.id, cat.name, cb.source as src, cb."deletedAt" as cb_deleted, cb.id as cb_id
      from public.categories cat
      left join public.category_buckets cb on cb.user_id = cat.user_id and cb."categoryId" = cat.id
     where cat.user_id = p_user and cat."deletedAt" is null and cat."categoryType" = 1 and not (cat.id = any (v_handled))
     order by cat."displayOrder", cat.id
  loop
    continue when c.cb_id is not null and c.cb_deleted is null and not (p_mode = 'plan' and c.src = 'auto');
    v_bkey := public.onb_auto_bucket(c.name, pa, v_skip);
    if not (p_ids ? v_bkey) then v_bkey := 'living'; end if;
    perform public.onb_map_category(p_user, c.id, (p_ids ->> v_bkey)::uuid, 'auto', v_since);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- summary for the Done card (SPEC 7.5.3)

create or replace function public.onb_summary(p_user uuid, p_entry text)
returns jsonb language plpgsql stable security invoker set search_path = public
as $$
declare
  v_cycle uuid;
  v_split bigint := 0;
  v_split_n int := 0;
  v_tr int := 0;
  v_tr_done int := 0;
  v_em uuid;
begin
  if p_entry is not null then
    select coalesce(sum(a."amountMinor"), 0)::bigint, (count(*) filter (where a."amountMinor" > 0))::int, max(a."transferCycleId"::text)::uuid
      into v_split, v_split_n, v_cycle
      from public.allocations a where a.user_id = p_user and a."ledgerEntryId" = p_entry and a."deletedAt" is null;
    if v_cycle is not null then
      select count(*)::int, (count(*) filter (where t.done))::int into v_tr, v_tr_done
        from public.engine_transfer_plan(p_user, v_cycle) t where t.kind = 'transfer';
    end if;
  end if;
  v_em := public.engine_emergency_bucket(p_user);
  return jsonb_build_object(
    'bucketsCount', (select count(*) from public.buckets b where b.user_id = p_user and b."deletedAt" is null and not b."isArchived"),
    'splitMinor', v_split,
    'splitBucketsCount', v_split_n,
    'transfersCount', v_tr,
    'transfersTicked', v_tr_done,
    'safeToSpendMinor', coalesce((select sum(l.left_minor) from public.engine_bucket_left(p_user) l
                                    join public.buckets b on b.id = l.bucket_id where b."groupKey" = 'spend'), 0),
    'emergencyLeftMinor', coalesce((select l.left_minor from public.engine_bucket_left(p_user) l where l.bucket_id = v_em), 0),
    'spendingBeforeMinor', coalesce((select sum(l.spent) from public.engine_bucket_left(p_user) l
                                       join public.buckets b on b.id = l.bucket_id where b."groupKey" = 'spend'), 0));
end;
$$;

-- ---------------------------------------------------------------- finish_onboarding

create or replace function public.finish_onboarding(p_draft jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now bigint := public.now_ms();
  v_skip boolean;
  v_path text;
  v_ids jsonb;
  v_main jsonb;
  v_entry text;
  v_choice text;
  v_confirmed boolean := false;
  v_summary jsonb;
  v_onb bigint;
  v_pay_ms bigint;
  v_start bigint;
  v_el jsonb;
  v_row record;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:onboarding:' || v_user::text, 0));

  -- idempotent per user: once onboarded, a repeat call changes nothing and returns the same summary
  select up."onboardedAt" into v_onb from public.user_profiles up where up.user_id = v_user;
  if v_onb is not null then
    select e.props into v_summary from public.events e
     where e.user_id = v_user and e.name = 'onboarding_finished' order by e."occurredAt" desc, e.id limit 1;
    return coalesce(v_summary, public.onb_summary(v_user, nullif(p_draft #>> '{firstPay,entryId}', '')));
  end if;

  perform public.onb_validate_draft(p_draft, 'finish');
  v_skip := (p_draft ->> 'skipped')::boolean;
  v_path := p_draft ->> 'path';
  v_choice := coalesce(p_draft #>> '{firstPay,choice}', 'later');
  v_entry := nullif(p_draft #>> '{firstPay,entryId}', '');

  perform public.onb_ensure_accounts(v_user, p_draft, 'finish');
  v_ids := public.onb_apply_plan(v_user, p_draft, 'finish');
  v_main := public.onb_apply_sources(v_user, p_draft, v_ids);
  perform public.onb_apply_categories(v_user, p_draft, 'finish', v_ids);

  -- first pay
  if v_choice = 'yes' and (p_draft #>> '{firstPay,splitConfirmed}')::boolean then
    if v_path = 'web' then
      v_pay_ms := (extract(epoch from (((p_draft #>> '{firstPay,date}')::date)::timestamp + interval '12 hours') at time zone 'Asia/Manila') * 1000)::bigint;
      insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "recurringInstanceId", "debtId", "splitId", "transferId",
                                         "amountMinor", direction, origin, "occurredAt", note, "metadataJson", "createdAt", "updatedAt", "deletedAt", "syncStatus")
      values (v_entry, v_user, v_main ->> 'landsIn', v_main ->> 'categoryId', null, null, null, null,
              (p_draft #>> '{firstPay,amountMinor}')::bigint, 0, 0, v_pay_ms, null, null, v_now, v_now, null, 2)
      on conflict (id) do nothing;
    end if;
    -- the entry must be the caller's own live inflow (not a transfer leg)
    select le."occurredAt" into v_pay_ms from public.ledger_entries le
     where le.id = v_entry and le.user_id = v_user and le.direction = 0 and le.origin <> 3 and le."deletedAt" is null;
    if not found then
      raise exception 'income entry % not found or not yours', v_entry using errcode = '42501';
    end if;

    if not exists (select 1 from public.allocations a where a.user_id = v_user and a."ledgerEntryId" = v_entry and a."deletedAt" is null) then
      -- link the entry to the main source (the recognition trigger may have done it already); the job is the plan
      insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job, "createdAt", "updatedAt")
      values (v_user, v_entry, (v_main ->> 'sourceId')::uuid, 'plan', v_now, v_now)
      on conflict (user_id, "ledgerEntryId")
      do update set "sourceId" = excluded."sourceId", job = 'plan', "deletedAt" = null, "updatedAt" = v_now;

      -- spending already logged this pay period (since the pay's date) counts from the start
      v_start := (extract(epoch from (public.entry_local_date(v_pay_ms)::timestamp at time zone 'Asia/Manila')) * 1000)::bigint;
      insert into public.entry_buckets (user_id, "ledgerEntryId", "bucketId", source)
      select le.user_id, le.id, cb."bucketId", 'category'
        from public.ledger_entries le
        join public.category_buckets cb on cb.user_id = le.user_id and cb."categoryId" = le."categoryId" and cb."deletedAt" is null
       where le.user_id = v_user and le.direction = 1 and le.origin <> 3 and le."deletedAt" is null and le."occurredAt" >= v_start
      on conflict (user_id, "ledgerEntryId") do nothing;

      perform * from public.confirm_incomes(array[v_entry]);
    end if;
    v_confirmed := true;

    -- ticked transfers: the same code path as the Money in checkbox (tick_transfer), at the checklist's amount
    for v_el in select value from jsonb_array_elements(p_draft #> '{firstPay,ticked}') loop
      select t.amount, t.done into v_row from public.engine_transfer_plan(v_user, public.engine_latest_cycle(v_user)) t
       where t.kind = 'transfer' and t.from_account_id = v_el ->> 'fromAccountId' and t.to_account_id = v_el ->> 'toAccountId';
      if not found then
        raise exception 'Moving money from % to % is not part of your payday plan, so it cannot be ticked',
          v_el ->> 'fromAccountId', v_el ->> 'toAccountId' using errcode = '22023';
      end if;
      if not v_row.done then
        perform public.tick_transfer(v_el ->> 'fromAccountId', v_el ->> 'toAccountId', v_row.amount);
      end if;
    end loop;
  end if;

  insert into public.user_profiles (user_id, "firstName", "nextPaydayDate", "payFrequency", "planMode", priority, "onboardingPath",
                                    "onboardedAt", "paydayReminder", "onboardingDraft")
  values (v_user, nullif(btrim(p_draft ->> 'firstName'), ''), (p_draft #>> '{income,nextPayday}')::date, p_draft #>> '{income,frequency}',
          case when v_skip then 'track' else 'plan' end, case when v_skip then null else p_draft ->> 'priority' end,
          v_path, v_now, p_draft #>> '{firstPay,reminder}', '{}'::jsonb)
  on conflict (user_id) do update
     set "firstName" = excluded."firstName", "nextPaydayDate" = excluded."nextPaydayDate", "payFrequency" = excluded."payFrequency",
         "planMode" = excluded."planMode", priority = excluded.priority, "onboardingPath" = excluded."onboardingPath",
         "onboardedAt" = excluded."onboardedAt", "paydayReminder" = excluded."paydayReminder", "onboardingDraft" = '{}'::jsonb;

  v_summary := public.onb_summary(v_user, case when v_confirmed then v_entry end);
  insert into public.events (user_id, name, props) values (v_user, 'onboarding_finished', v_summary);
  return v_summary;
end;
$$;

-- ---------------------------------------------------------------- apply_plan_only (BR 12.7)

-- "Make a plan" after just tracking: plans, homes, rules, automatic category moves, the Emergency goal. Future money
-- only: allocations, user-set category mappings and existing goals are never touched.
create or replace function public.apply_plan_only(p_draft jsonb)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ids jsonb;
  v_onb bigint;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:onboarding:' || v_user::text, 0));
  select up."onboardedAt" into v_onb from public.user_profiles up where up.user_id = v_user;
  if v_onb is null then
    raise exception 'Finish setting up first; Make a plan is for after you have started tracking' using errcode = '22023';
  end if;
  perform public.onb_validate_draft(p_draft, 'plan');
  perform public.onb_ensure_accounts(v_user, p_draft, 'plan');
  v_ids := public.onb_apply_plan(v_user, p_draft, 'plan');
  perform public.onb_apply_categories(v_user, p_draft, 'plan', v_ids);
  update public.user_profiles
     set "planMode" = 'plan', priority = p_draft ->> 'priority', "onboardingDraft" = '{}'::jsonb
   where user_id = v_user;
end;
$$;

-- ---------------------------------------------------------------- privileges
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and (p.proname like 'onb\_%' or p.proname in ('suggest_plan', 'finish_onboarding', 'apply_plan_only'))
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
