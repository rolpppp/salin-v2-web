-- Onboarding v2 (P-12, ticket 29): allowance / stipend / mix users finish into Simple view.
--   onb_validate_draft: knows `pattern`, `rhythm` and `firstMoney` (all optional; a draft without them is unchanged);
--     next payday is optional for allowance / mix (the user may not know the date).
--   finish_onboarding: for allowance / mix sets viewMode = 'simple', spendUntil = rhythm.nextDate, and records the first
--     money with receive_money (spending lines per account, kept aside to Emergency). Salary drafts take the old path.
-- Nothing else changes; no mobile table is touched.

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
  v_pattern text;
  v_simple boolean;
  v_k2 text;
  v_v2 jsonb;
begin
  if p_d is null or jsonb_typeof(p_d) <> 'object' then
    raise exception 'The onboarding draft must be a json object' using errcode = '22023';
  end if;
  if p_d -> 'v' is distinct from to_jsonb(1) then
    raise exception 'This draft is version %, but only version 1 is supported. Start the steps again.', coalesce(p_d ->> 'v', 'unknown') using errcode = '22023';
  end if;
  v_path := public.onb_text(p_d -> 'path', 'Path', array['web', 'app']);
  v_skip := public.onb_bool(p_d -> 'skipped', 'skipped');

  -- Onboarding v2 (P-12): allowance / mix is a just-tracking web draft that also carries its rhythm and first money.
  v_pattern := case when public.onb_present(p_d -> 'pattern') then public.onb_text(p_d -> 'pattern', 'Pattern', array['allowance', 'salary', 'mix']) end;
  v_simple := coalesce(v_pattern in ('allowance', 'mix'), false);
  if v_simple then
    if v_path <> 'web' or not v_skip then
      raise exception 'An allowance or mixed-income setup is a web, just-tracking draft' using errcode = '22023';
    end if;
    if p_mode = 'finish' then
      perform public.onb_text(p_d #> '{rhythm,frequency}', 'How often the money comes', array['weekly', 'biweekly', 'monthly', 'quarterly', 'semester', 'varies']);
      if public.onb_present(p_d #> '{rhythm,nextDate}') then perform public.onb_date(p_d #> '{rhythm,nextDate}', 'Next date'); end if;
      if public.onb_present(p_d #> '{firstMoney,amountMinor}') then
        perform public.onb_int(p_d #> '{firstMoney,amountMinor}', 'First money', 1, 1000000000);
        perform public.onb_int(p_d #> '{firstMoney,keepMinor}', 'Kept aside', 0, 1000000000);
        if coalesce(jsonb_typeof(p_d #> '{firstMoney,extra}'), '') <> 'object' then raise exception 'firstMoney.extra must be an object' using errcode = '22023'; end if;
        for v_k2, v_v2 in select key, value from jsonb_each(p_d #> '{firstMoney,extra}') loop
          perform public.onb_int(v_v2, 'The amount in ' || v_k2, 0, 1000000000);
        end loop;
      end if;
    end if;
  end if;
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
    if not v_simple or public.onb_present(p_d #> '{income,nextPayday}') then
      perform public.onb_date(p_d #> '{income,nextPayday}', 'Next payday');
    end if;
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
  v_simple boolean;
  v_land text;
  v_amt bigint;
  v_keep bigint;
  v_moved bigint := 0;
  v_here bigint;
  v_lines jsonb := '[]'::jsonb;
  v_k text;
  v_v jsonb;
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

  -- Onboarding v2: allowance / mix. Simple view, the "make it last until" date, and the money in hand recorded the same
  -- way "I got money" does (spending in the landing account, anything sent on, and what is kept aside to Emergency).
  v_simple := coalesce(p_draft ->> 'pattern', '') in ('allowance', 'mix');
  if v_simple and public.onb_present(p_draft #> '{firstMoney,amountMinor}') then
    v_land := p_draft ->> 'landingAccountId';
    v_amt := (p_draft #>> '{firstMoney,amountMinor}')::bigint;
    v_keep := coalesce((p_draft #>> '{firstMoney,keepMinor}')::bigint, 0);
    for v_k, v_v in select key, value from jsonb_each(p_draft #> '{firstMoney,extra}') loop
      -- amounts left on an account the user unticked later are ignored, as the client's split ignores them
      if (v_v #>> '{}')::bigint > 0 and v_k <> v_land
         and exists (select 1 from jsonb_array_elements(p_draft -> 'accounts') a where a ->> 'id' = v_k) then
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('bucketId', v_ids ->> 'living', 'destAccountId', v_k, 'amountMinor', (v_v #>> '{}')::bigint));
        v_moved := v_moved + (v_v #>> '{}')::bigint;
      end if;
    end loop;
    v_here := v_amt - v_moved - v_keep;
    if v_here < 0 then raise exception 'The amounts you moved and kept aside add up to more than you have' using errcode = '22023'; end if;
    if v_here > 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('bucketId', v_ids ->> 'living', 'destAccountId', v_land, 'amountMinor', v_here)); end if;
    if v_keep > 0 then v_lines := v_lines || jsonb_build_array(jsonb_build_object('bucketId', v_ids ->> 'emergency', 'destAccountId', v_land, 'amountMinor', v_keep)); end if;
    perform public.receive_money(v_amt, v_land, (v_main ->> 'sourceId')::uuid, null, public.entry_local_date(v_now), v_lines);
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

  if v_simple then
    update public.user_profiles
       set "viewMode" = 'simple', "spendUntil" = nullif(p_draft #>> '{rhythm,nextDate}', '')::date
     where user_id = v_user;
  end if;

  v_summary := public.onb_summary(v_user, case when v_confirmed then v_entry end);
  insert into public.events (user_id, name, props) values (v_user, 'onboarding_finished', v_summary);
  return v_summary;
end;
$$;
