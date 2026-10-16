-- Settings (ticket 37, P-13): keep what onboarding asked, and let people change it.
--   user_profiles: payAmountMinor (about how much each time), payRhythm (how often, with quarterly / semester kept)
--   set_income_rhythm(amount, rhythm, next):  writes the rhythm, payFrequency (mapped), nextPaydayDate and spendUntil
--   set_profile_basics(name, week start, review day)
--   finish_onboarding: redefined only to save payAmountMinor / payRhythm from the draft (body otherwise as in 20261015000200)
-- user_profiles is a web table; no mobile-synced table is touched. Changes apply from now on: nothing already
-- received, allocated or closed is recomputed (a closed week_reviews row stays a record of its own dates).

alter table public.user_profiles
  add column "payAmountMinor" bigint check ("payAmountMinor" > 0 and "payAmountMinor" <= 1000000000),
  add column "payRhythm" text check ("payRhythm" in ('weekly', 'biweekly', 'twice', 'monthly', 'quarterly', 'semester', 'varies'));

-- Any argument may be null (= not set). Next-money date: today or later (Manila calendar), unless it is the date already saved.
-- spendUntil follows the date only when it is already set (Simple view reads it first); clearing the date clears both.
create or replace function public.set_income_rhythm(p_amount bigint, p_rhythm text, p_next date)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := public.entry_local_date(public.now_ms());
  v_cur date;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_amount is not null and (p_amount < 1 or p_amount > 1000000000) then
    raise exception 'Enter an amount above zero and below ₱10,000,000.' using errcode = '22023';
  end if;
  if p_rhythm is not null and p_rhythm not in ('weekly', 'biweekly', 'twice', 'monthly', 'quarterly', 'semester', 'varies') then
    raise exception 'Pick how often the money comes.' using errcode = '22023';
  end if;
  select up."nextPaydayDate" into v_cur from public.user_profiles up where up.user_id = v_user and up."deletedAt" is null;
  if not found then raise exception 'Finish setting up first.' using errcode = 'P0001'; end if;
  if p_next is not null and p_next < v_today and p_next is distinct from v_cur then
    raise exception 'Pick today or a later date.' using errcode = '22023';
  end if;
  update public.user_profiles
     set "payAmountMinor" = p_amount,
         "payRhythm" = p_rhythm,
         "payFrequency" = case when p_rhythm is null then null when p_rhythm in ('quarterly', 'semester') then 'varies' else p_rhythm end,
         "nextPaydayDate" = p_next,
         "spendUntil" = case when p_next is null then null when "spendUntil" is not null then p_next else "spendUntil" end
   where user_id = v_user and "deletedAt" is null;
end;
$$;

create or replace function public.set_profile_basics(p_first_name text, p_week_starts_on int, p_review_day int)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(btrim(p_first_name), '');
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if v_name is not null and char_length(v_name) > 60 then
    raise exception 'Keep your name to 60 letters or fewer.' using errcode = '22023';
  end if;
  if p_week_starts_on is null or p_week_starts_on not in (0, 1) then
    raise exception 'The week starts on Monday or Sunday.' using errcode = '22023';
  end if;
  if p_review_day is null or p_review_day not between 0 and 6 then
    raise exception 'Pick a day of the week for your review.' using errcode = '22023';
  end if;
  update public.user_profiles
     set "firstName" = v_name, "weekStartsOn" = p_week_starts_on, "reviewDay" = p_review_day
   where user_id = v_user and "deletedAt" is null;
  if not found then raise exception 'Finish setting up first.' using errcode = 'P0001'; end if;
end;
$$;

revoke execute on function public.set_income_rhythm(bigint, text, date) from public, anon;
revoke execute on function public.set_profile_basics(text, int, int) from public, anon;
grant execute on function public.set_income_rhythm(bigint, text, date) to authenticated;
grant execute on function public.set_profile_basics(text, int, int) to authenticated;

-- finish_onboarding: the draft's amount and rhythm are kept (allowance / mix drafts: rhythm.*; the others: income.*).
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

  insert into public.user_profiles (user_id, "firstName", "nextPaydayDate", "payFrequency", "payAmountMinor", "payRhythm", "planMode", priority,
                                    "onboardingPath", "onboardedAt", "paydayReminder", "onboardingDraft")
  values (v_user, nullif(btrim(p_draft ->> 'firstName'), ''), (p_draft #>> '{income,nextPayday}')::date, p_draft #>> '{income,frequency}',
          nullif(case when v_simple then (p_draft #>> '{rhythm,amountMinor}')::bigint else (p_draft #>> '{income,amountMinor}')::bigint end, 0),
          case when v_simple then p_draft #>> '{rhythm,frequency}' else p_draft #>> '{income,frequency}' end,
          case when v_skip then 'track' else 'plan' end, case when v_skip then null else p_draft ->> 'priority' end,
          v_path, v_now, p_draft #>> '{firstPay,reminder}', '{}'::jsonb)
  on conflict (user_id) do update
     set "firstName" = excluded."firstName", "nextPaydayDate" = excluded."nextPaydayDate", "payFrequency" = excluded."payFrequency",
         "payAmountMinor" = excluded."payAmountMinor", "payRhythm" = excluded."payRhythm",
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
