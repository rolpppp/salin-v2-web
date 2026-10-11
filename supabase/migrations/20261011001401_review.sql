-- =============================================================================
-- Review + close the week (SPEC 3, BR 8, D-18, ROADMAP ticket 14).
--
-- All SECURITY INVOKER (RLS applies), search_path = public, every one starts with assert_self().
-- Nothing here touches `allocations` (immutable) or any of the 12 mobile-synced tables.
--
--   engine_waiting_income(user)         income with a job still to choose (no live allocation)
--   week_slip_figures(from_ms)          the week slip's income / spending side (see the window note there)
--   week_bucket_flows(from_ms, to_ms)   per-bucket flows inside one window (this week / last week)
--   week_category_spend(from_ms, to_ms) per bucket x category spending inside one window
--   tab_badges(today)                   waiting-income count + "review due" for the header, one cheap call
--   close_week(week_start, observation) computes the three checks server-side, stores the week_reviews row
--   nudge_plan_percent(from, to, bp)    moves bp between two buckets in EVERY plan, atomically (D-18)
-- =============================================================================

-- ---------------------------------------------------------------- waiting income

-- An inflow (not a transfer, not deleted) with an income_meta row and no live allocation (DATA_MODEL 7).
create or replace function public.engine_waiting_income(p_user uuid)
returns table(entry_id text, amount bigint, occurred_at bigint, source_id uuid)
language sql stable security invoker set search_path = public
as $$
  select le.id, le."amountMinor", le."occurredAt", im."sourceId"
    from public.income_meta im
    join public.ledger_entries le on le.id = im."ledgerEntryId" and le.user_id = p_user
   where im.user_id = p_user and im."deletedAt" is null
     and le."deletedAt" is null and le.direction = 0 and le.origin <> 3
     and not exists (select 1 from public.allocations a
                      where a.user_id = p_user and a."ledgerEntryId" = le.id and a."deletedAt" is null)
$$;

-- ---------------------------------------------------------------- week slip figures

-- The income and spending side of the week slip. WINDOW (the identity depends on it, BR 8.3):
--   * Every "left" figure (Put away, Tax, Cushions, Safe to spend) is the bucket's LEFT NOW, over all time,
--     exactly as bucket_left() computes it. That is what keeps the slip true when money is spent from a
--     set-aside (a BIR payment from Tax) and when a cover moves money (covers net to zero across buckets).
--   * So the income and spending lines must be the other half of the same all-time identity:
--       all income to date  =  all bucketed spending to date  +  sum(left)  +  to assign
--     We split "to date" at the start of the week so the slip still reads as THIS week:
--       Came in  = income that landed this week (occurredAt >= p_from)  +  carried_in
--       Spent    = bucketed spending this week (occurredAt >= p_from)
--       carried_in = income before the week - bucketed spending before the week
--                    (what earlier weeks left behind; negative if earlier weeks overspent)
--     and then  Came in = Spent + sum(left) + to_assign  holds exactly, with no fudge line.
--   * Income = confirmed income (sum of its live allocations, entries not deleted: P-4) + waiting income
--     (its amount). Spending = entry_buckets of live outflows that are not transfers, on live buckets: the
--     same filters as engine_bucket_left, so the two halves can never drift apart.
--   * The window is open-ended on the right (>= p_from): the slip describes the current week as of now.
create or replace function public.week_slip_figures(p_from bigint)
returns table(came_in_week bigint, carried_in bigint, spent_week bigint, to_assign bigint, has_history boolean, sources jsonb)
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_in_week bigint; v_in_before bigint; v_sp_week bigint; v_sp_before bigint; v_wait bigint; v_hist boolean; v_src jsonb;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_from is null then raise exception 'p_from is required' using errcode = '22023'; end if;

  with inc as (
    select le.id, le."occurredAt" as at, sum(a."amountMinor")::bigint as amt, coalesce(max(s.name), 'Other income') as src
      from public.allocations a
      join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = v_user and le."deletedAt" is null
      join public.buckets bk on bk.id = a."bucketId" and bk.user_id = v_user and bk."deletedAt" is null
      left join public.income_meta im on im.user_id = v_user and im."ledgerEntryId" = le.id and im."deletedAt" is null
      left join public.income_sources s on s.id = im."sourceId" and s.user_id = v_user
     where a.user_id = v_user and a."deletedAt" is null
     group by le.id, le."occurredAt"
    union all
    select w.entry_id, w.occurred_at, w.amount, coalesce(s.name, 'Other income')
      from public.engine_waiting_income(v_user) w
      left join public.income_sources s on s.id = w.source_id and s.user_id = v_user
  ), per_src as (
    select src, sum(amt)::bigint as total from inc where at >= p_from group by src
  )
  select coalesce((select sum(amt) from inc where at >= p_from), 0),
         coalesce((select sum(amt) from inc where at < p_from), 0),
         (exists (select 1 from inc where at < p_from)
          or exists (select 1 from public.allocations a where a.user_id = v_user and a."deletedAt" is null and a."confirmedAt" < p_from)),
         coalesce((select jsonb_agg(jsonb_build_object('name', ps.src, 'amountMinor', ps.total) order by ps.total desc, ps.src) from per_src ps), '[]'::jsonb)
    into v_in_week, v_in_before, v_hist, v_src;
  select coalesce(sum(w.amount), 0) into v_wait from public.engine_waiting_income(v_user) w;

  select coalesce(sum(le."amountMinor") filter (where le."occurredAt" >= p_from), 0),
         coalesce(sum(le."amountMinor") filter (where le."occurredAt" < p_from), 0)
    into v_sp_week, v_sp_before
    from public.entry_buckets eb
    join public.ledger_entries le on le.id = eb."ledgerEntryId" and le.user_id = v_user
    join public.buckets bk on bk.id = eb."bucketId" and bk.user_id = v_user and bk."deletedAt" is null
   where eb.user_id = v_user and eb."deletedAt" is null
     and le.direction = 1 and le.origin <> 3 and le."deletedAt" is null;

  return query select v_in_week + (v_in_before - v_sp_before), v_in_before - v_sp_before, v_sp_week, v_wait, v_hist, v_src;
end;
$$;

-- ---------------------------------------------------------------- week flows

-- Per live bucket, inside [p_from, p_to): allocated (by confirmedAt), spent (by occurredAt), covers in / out
-- (by occurredAt) and the net change. Used for "where spending went", the Emergency fund's change this week
-- and the last-week comparison. Not a reconciliation figure (that is week_slip_figures).
create or replace function public.week_bucket_flows(p_from bigint, p_to bigint)
returns table(bucket_id uuid, allocated_minor bigint, spent_minor bigint, covers_in_minor bigint, covers_out_minor bigint, change_minor bigint)
language plpgsql stable security invoker set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'bad window' using errcode = '22023'; end if;
  return query
  with al as (
    select a."bucketId" as b, sum(a."amountMinor")::bigint as s
      from public.allocations a
      join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = v_user and le."deletedAt" is null
     where a.user_id = v_user and a."deletedAt" is null and a."confirmedAt" >= p_from and a."confirmedAt" < p_to
     group by a."bucketId"
  ), sp as (
    select eb."bucketId" as b, sum(le."amountMinor")::bigint as s
      from public.entry_buckets eb
      join public.ledger_entries le on le.id = eb."ledgerEntryId" and le.user_id = v_user
     where eb.user_id = v_user and eb."deletedAt" is null and le.direction = 1 and le.origin <> 3 and le."deletedAt" is null
       and le."occurredAt" >= p_from and le."occurredAt" < p_to
     group by eb."bucketId"
  ), ci as (
    select "toBucketId" as b, sum("amountMinor")::bigint as s from public.bucket_covers
     where user_id = v_user and "deletedAt" is null and "occurredAt" >= p_from and "occurredAt" < p_to group by 1
  ), co as (
    select "fromBucketId" as b, sum("amountMinor")::bigint as s from public.bucket_covers
     where user_id = v_user and "deletedAt" is null and "occurredAt" >= p_from and "occurredAt" < p_to group by 1
  )
  select bk.id, coalesce(al.s, 0), coalesce(sp.s, 0), coalesce(ci.s, 0), coalesce(co.s, 0),
         coalesce(al.s, 0) - coalesce(sp.s, 0) + coalesce(ci.s, 0) - coalesce(co.s, 0)
    from public.buckets bk
    left join al on al.b = bk.id left join sp on sp.b = bk.id left join ci on ci.b = bk.id left join co on co.b = bk.id
   where bk.user_id = v_user and bk."deletedAt" is null
   order by bk."displayOrder", bk.id;
end;
$$;

-- Spending by bucket and category inside [p_from, p_to): the "biggest category" the observation names.
create or replace function public.week_category_spend(p_from bigint, p_to bigint)
returns table(bucket_id uuid, category_id text, category_name text, amount_minor bigint)
language plpgsql stable security invoker set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'bad window' using errcode = '22023'; end if;
  return query
  select eb."bucketId", le."categoryId", c.name, sum(le."amountMinor")::bigint
    from public.entry_buckets eb
    join public.ledger_entries le on le.id = eb."ledgerEntryId" and le.user_id = v_user
    join public.buckets bk on bk.id = eb."bucketId" and bk.user_id = v_user and bk."deletedAt" is null
    left join public.categories c on c.id = le."categoryId" and c.user_id = v_user
   where eb.user_id = v_user and eb."deletedAt" is null and le.direction = 1 and le.origin <> 3 and le."deletedAt" is null
     and le."occurredAt" >= p_from and le."occurredAt" < p_to
   group by eb."bucketId", le."categoryId", c.name
   order by 4 desc, 3, 2;
end;
$$;

-- ---------------------------------------------------------------- tab badges (SPEC 0)

-- One cheap call for the header: how much income waits, and whether Review is due today (today is the
-- user's review day and this week has no week_reviews row). p_today is the user's calendar date.
create or replace function public.tab_badges(p_today date)
returns table(waiting_count integer, review_due boolean)
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ws int; v_rd int; v_dow int; v_start date;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_today is null then raise exception 'p_today is required' using errcode = '22023'; end if;
  select up."weekStartsOn", up."reviewDay" into v_ws, v_rd
    from public.user_profiles up where up.user_id = v_user and up."deletedAt" is null;
  v_ws := coalesce(v_ws, 1); v_rd := coalesce(v_rd, 0);
  v_dow := extract(dow from p_today)::int;
  v_start := p_today - ((v_dow - v_ws + 7) % 7);
  return query select
    (select count(*)::int from public.engine_waiting_income(v_user)),
    (v_dow = v_rd and not exists (select 1 from public.week_reviews wr
                                   where wr.user_id = v_user and wr."weekStart" = v_start and wr."deletedAt" is null));
end;
$$;

-- ---------------------------------------------------------------- close_week

-- Closes a week (BR 8.2): the three checks are computed HERE so a client can't forge them.
--   assign    = no income is waiting for a job
--   transfers = all income has a job, at least one payday was confirmed, and the latest cycle has no open transfer
--               (the same rule as weekLoopSteps "Transfers made")
--   living    = every Living bucket's left is >= 0
-- Closing is allowed with open items; they carry into next week. A closed week is a record: closing it again
-- changes nothing and returns the stored result with was_already_closed = true.
create or replace function public.close_week(p_week_start date, p_observation text default null)
returns table(was_already_closed boolean, check_results jsonb, safe_to_spend_minor bigint, closed_at_ms bigint)
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ws int;
  v_assign boolean; v_confirmed boolean; v_pending boolean; v_living boolean;
  v_checks jsonb; v_safe bigint; v_row public.week_reviews;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_week_start is null then raise exception 'p_week_start is required' using errcode = '22023'; end if;
  if p_observation is not null and char_length(p_observation) > 400 then
    raise exception 'observation is too long' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:close_week:' || v_user::text, 0));

  select * into v_row from public.week_reviews wr where wr.user_id = v_user and wr."weekStart" = p_week_start;
  if found then
    return query select true, v_row.checks, v_row."safeToSpendMinor", v_row."closedAt";
    return;
  end if;

  select up."weekStartsOn" into v_ws from public.user_profiles up where up.user_id = v_user and up."deletedAt" is null;
  v_ws := coalesce(v_ws, 1);
  if extract(dow from p_week_start)::int <> v_ws then
    raise exception 'That date is not the first day of your week.' using errcode = '22023';
  end if;
  if p_week_start > current_date + 1 then
    raise exception 'That week has not started yet.' using errcode = '22023';
  end if;

  v_assign := not exists (select 1 from public.engine_waiting_income(v_user));
  v_confirmed := exists (select 1 from public.allocations a
                          join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = v_user and le."deletedAt" is null
                         where a.user_id = v_user and a."deletedAt" is null);
  v_pending := exists (select 1 from public.engine_transfer_plan(v_user, public.engine_latest_cycle(v_user)) t
                        where t.kind = 'transfer' and not t.done);
  select coalesce(bool_and(l.left_minor >= 0), true) into v_living
    from public.engine_bucket_left(v_user) l join public.buckets b on b.id = l.bucket_id and b.user_id = v_user
   where b.hue = 'living';
  select coalesce(sum(l.left_minor), 0)::bigint into v_safe
    from public.engine_bucket_left(v_user) l join public.buckets b on b.id = l.bucket_id and b.user_id = v_user
   where b."groupKey" = 'spend';

  v_checks := jsonb_build_object('assign', v_assign, 'transfers', (v_assign and v_confirmed and not v_pending), 'living', v_living);

  insert into public.week_reviews (user_id, "weekStart", checks, "safeToSpendMinor", observation)
  values (v_user, p_week_start, v_checks, v_safe, nullif(btrim(p_observation), ''))
  returning * into v_row;
  return query select false, v_row.checks, v_row."safeToSpendMinor", v_row."closedAt";
end;
$$;

-- ---------------------------------------------------------------- nudge_plan_percent (D-18)

-- "Move 1% from Fun to Living": moves p_bp basis points from one bucket to another in EVERY plan of the user
-- (Living's need doesn't depend on the plan), in one transaction. Refuses, changing nothing, if the giving
-- bucket would go below 0 in any plan and says which plan. Each plan keeps totalling 10000 bp. Future
-- paydays only: allocations are snapshots and are never touched. Returns each plan's new percentages.
create or replace function public.nudge_plan_percent(p_from_bucket uuid, p_to_bucket uuid, p_bp integer)
returns table(plan_key text, from_bp integer, to_bp integer)
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_from_name text; v_to_name text;
  v_now bigint := public.now_ms();
  r record;
  v_total bigint;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_bp is null or p_bp < 1 or p_bp > 10000 then raise exception 'the amount to move must be between 0.01 and 100 percent' using errcode = '22023'; end if;
  if p_from_bucket is null or p_to_bucket is null or p_from_bucket = p_to_bucket then
    raise exception 'pick two different buckets' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:plan:' || v_user::text, 0));

  select b.name into v_from_name from public.buckets b
   where b.id = p_from_bucket and b.user_id = v_user and b."deletedAt" is null and not b."isArchived" and not b.planless;
  if v_from_name is null then raise exception 'bucket % is not one of your plan buckets', p_from_bucket using errcode = '42501'; end if;
  select b.name into v_to_name from public.buckets b
   where b.id = p_to_bucket and b.user_id = v_user and b."deletedAt" is null and not b."isArchived" and not b.planless;
  if v_to_name is null then raise exception 'bucket % is not one of your plan buckets', p_to_bucket using errcode = '42501'; end if;

  if not exists (select 1 from public.allocation_plans p where p.user_id = v_user and p."deletedAt" is null) then
    raise exception 'there is no plan to change' using errcode = 'P0002';
  end if;

  -- Check every plan first so a refusal changes nothing.
  for r in
    select p.key, p.name,
           coalesce((select l."percentBp" from public.allocation_plan_lines l
                      where l."planId" = p.id and l."bucketId" = p_from_bucket and l."deletedAt" is null limit 1), 0) as have_bp
      from public.allocation_plans p where p.user_id = v_user and p."deletedAt" is null order by p.key
  loop
    if r.have_bp < p_bp then
      raise exception '%', format('%s is at %s%% in %s, so %s%% can''t move to %s. Change the split in Plans instead.',
        v_from_name, trim_scale((r.have_bp / 100.0)::numeric(6,2)), r.name, trim_scale((p_bp / 100.0)::numeric(6,2)), v_to_name)
        using errcode = '22023';
    end if;
  end loop;

  for r in select p.id, p.key from public.allocation_plans p where p.user_id = v_user and p."deletedAt" is null order by p.key loop
    update public.allocation_plan_lines
       set "percentBp" = "percentBp" - p_bp, "updatedAt" = v_now
     where user_id = v_user and "planId" = r.id and "bucketId" = p_from_bucket and "deletedAt" is null;
    update public.allocation_plan_lines
       set "percentBp" = "percentBp" + p_bp, "updatedAt" = v_now
     where user_id = v_user and "planId" = r.id and "bucketId" = p_to_bucket and "deletedAt" is null;
    if not exists (select 1 from public.allocation_plan_lines
                    where user_id = v_user and "planId" = r.id and "bucketId" = p_to_bucket and "deletedAt" is null) then
      insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp", "createdAt", "updatedAt")
      values (v_user, r.id, p_to_bucket, p_bp, v_now, v_now);
    end if;
    select coalesce(sum("percentBp"), 0) into v_total from public.allocation_plan_lines
     where user_id = v_user and "planId" = r.id and "deletedAt" is null;
    if v_total <> 10000 then
      -- A plan that didn't total 100 before is not something to nudge; undo everything (the whole call rolls back).
      raise exception 'Plan % does not add up to 100 percent. Fix it in Plans first.', r.key using errcode = '22023';
    end if;
  end loop;

  return query
    select p.key,
           coalesce((select l."percentBp" from public.allocation_plan_lines l where l."planId" = p.id and l."bucketId" = p_from_bucket and l."deletedAt" is null limit 1), 0),
           coalesce((select l."percentBp" from public.allocation_plan_lines l where l."planId" = p.id and l."bucketId" = p_to_bucket and l."deletedAt" is null limit 1), 0)
      from public.allocation_plans p where p.user_id = v_user and p."deletedAt" is null order by p.key;
end;
$$;

-- ---------------------------------------------------------------- privileges
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('engine_waiting_income', 'week_slip_figures', 'week_bucket_flows', 'week_category_spend',
                         'tab_badges', 'close_week', 'nudge_plan_percent')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
