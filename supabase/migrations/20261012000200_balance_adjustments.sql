-- P-5: NOT APPLIED TO LIVE until tested with a real mobile sync.
-- =============================================================================
-- Balance adjustments (LedgerOrigin.adjustment = 6), written by the phone's "Update balances".
-- Shape: origin 6, categoryId null, transferId null, direction 1 (less money than recorded) or 0 (more),
-- amountMinor = |difference|, note 'Balance adjustment'.
--
-- Owner's decision: the difference is UNTRACKED SPENDING taken from Living.
--   * outflow adjustment = spending that was never logged: it counts against the user's Living bucket
--     (hue 'living'; a just-track user's one bucket "Spending" has hue 'living' too). If that takes Living
--     below zero the existing behaviour does the rest ("Needs P X", cover from Buffer).
--   * inflow adjustment = spending that turned out smaller: it is NEGATIVE spending in Living (adds back).
--   * never income: not waiting income, not confirmable, no income_meta, not "Came in".
--   * account balances already include every ledger entry (plans_accounts / lib/data/balances.ts): untouched.
--
-- Representation: an adjustment gets an entry_buckets row (source 'category') pointing at Living, like any
-- spending entry. Every "spent" sum is then
--     sum( case direction when 1 then amount else -amount end )
--   over entries where (direction = 1 and origin <> 3) or origin = 6,
-- so an inflow adjustment is a negative amount of spending and the bucket identity
--     left = allocated - spent + covers_in - covers_out
-- and the Review identity (came in = spent + sum(left) + to assign) both keep holding with no extra term.
-- Soft-deleted entries drop out through the existing `deletedAt is null` filter (and come back on restore).
-- =============================================================================

-- The bucket an adjustment counts against: the live 'living' bucket; else the first live spend-group bucket;
-- else null (no buckets yet: nothing to map, the backfill below maps it once buckets exist).
create or replace function public.adjustment_bucket(p_user uuid)
returns uuid language sql stable security invoker set search_path = public
as $$
  select b.id from public.buckets b
   where b.user_id = p_user and b."deletedAt" is null and not b."isArchived"
     and (b.hue = 'living' or b."groupKey" = 'spend')
   order by (b.hue = 'living') desc, b."displayOrder", b.id
   limit 1
$$;

create or replace function public.trg_adjustment_bucket()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare v_bucket uuid;
begin
  begin
    v_bucket := public.adjustment_bucket(new.user_id);
    if v_bucket is not null then
      insert into public.entry_buckets (user_id, "ledgerEntryId", "bucketId", source)
      values (new.user_id, new.id, v_bucket, 'category')
      on conflict (user_id, "ledgerEntryId") do nothing;
    end if;
  exception when others then
    raise warning 'trg_adjustment_bucket failed for entry %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

create trigger ledger_entries_adjustment_bucket_ins after insert on public.ledger_entries
  for each row when (new.origin = 6 and new."deletedAt" is null)
  execute function public.trg_adjustment_bucket();
-- Mobile pushes by upsert: an update re-maps a row that had no bucket yet (restore after delete, buckets created later).
create trigger ledger_entries_adjustment_bucket_upd after update on public.ledger_entries
  for each row when (new.origin = 6 and new."deletedAt" is null and old."deletedAt" is distinct from new."deletedAt")
  execute function public.trg_adjustment_bucket();

-- Maps every live adjustment that has no entry_buckets row yet. Idempotent.
create or replace function public.backfill_adjustment_buckets(p_user uuid default auth.uid())
returns int language plpgsql volatile security invoker set search_path = public
as $$
declare n int; v_bucket uuid;
begin
  v_bucket := public.adjustment_bucket(p_user);
  if v_bucket is null then return 0; end if;
  insert into public.entry_buckets (user_id, "ledgerEntryId", "bucketId", source)
  select le.user_id, le.id, v_bucket, 'category'
    from public.ledger_entries le
   where le.user_id = p_user and le.origin = 6 and le."deletedAt" is null
  on conflict (user_id, "ledgerEntryId") do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.backfill_adjustment_buckets(uuid) from public, anon;
grant execute on function public.backfill_adjustment_buckets(uuid) to authenticated;
revoke all on function public.adjustment_bucket(uuid) from public, anon;
grant execute on function public.adjustment_bucket(uuid) to authenticated;

-- Existing one-off backfill now maps adjustments too (plan setup / category moves call it).
create or replace function public.backfill_entry_buckets(p_user uuid default auth.uid())
returns int language plpgsql volatile security invoker set search_path = public
as $$
declare n int;
begin
  insert into public.entry_buckets (user_id, "ledgerEntryId", "bucketId", source)
  select le.user_id, le.id, cb."bucketId", 'category'
    from public.ledger_entries le
    join public.category_buckets cb on cb.user_id = le.user_id and cb."categoryId" = le."categoryId" and cb."deletedAt" is null
   where le.user_id = p_user and le.direction = 1 and le.origin <> 3 and le."deletedAt" is null
  on conflict (user_id, "ledgerEntryId") do nothing;
  get diagnostics n = row_count;
  n := n + public.backfill_adjustment_buckets(p_user);
  return n;
end;
$$;

-- Buckets created after adjustments exist (web onboarding of a phone user who already adjusted balances):
-- the new spend bucket picks them up. Wrapped so a failure can never block creating a bucket.
create or replace function public.trg_buckets_map_adjustments()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  begin
    perform public.backfill_adjustment_buckets(new.user_id);
  exception when others then
    raise warning 'trg_buckets_map_adjustments failed for user %: % (%)', new.user_id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
create trigger buckets_map_adjustments after insert on public.buckets
  for each row when (new."groupKey" = 'spend')
  execute function public.trg_buckets_map_adjustments();

-- Income recognition: an adjustment is never income (no income_meta row, so no "Others" source either).
drop trigger ledger_entries_income_recognition_ins on public.ledger_entries;
create trigger ledger_entries_income_recognition_ins after insert on public.ledger_entries
  for each row when (new.direction = 0 and new.origin <> 3 and new.origin <> 6 and new."deletedAt" is null)
  execute function public.trg_income_recognition();

-- Remove income_meta rows an earlier build might have created for an adjustment (idempotent; none expected).
delete from public.income_meta im using public.ledger_entries le
 where le.id = im."ledgerEntryId" and le.user_id = im.user_id and le.origin = 6
   and not exists (select 1 from public.allocations a where a.user_id = im.user_id and a."ledgerEntryId" = le.id);

-- ---------------------------------------------------------------- changed functions (CREATE OR REPLACE)
-- engine_bucket_left, confirm_incomes, engine_waiting_income, week_slip_figures, week_bucket_flows,
-- week_category_spend: the only change in each is the origin/direction classification above.

create or replace function public.engine_bucket_left(p_user uuid)
returns table(bucket_id uuid, allocated bigint, spent bigint, covers_in bigint, covers_out bigint, left_minor bigint)
language sql stable security invoker set search_path = public
as $$
  with al as (
    select a."bucketId" as b, sum(a."amountMinor")::bigint as s
      from public.allocations a
      join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = p_user and le."deletedAt" is null
     where a.user_id = p_user and a."deletedAt" is null
     group by a."bucketId"
  ),
  sp as (
    select eb."bucketId" as b, sum((case when le.direction = 1 then le."amountMinor" else -le."amountMinor" end))::bigint as s
      from public.entry_buckets eb
      join public.ledger_entries le on le.id = eb."ledgerEntryId" and le.user_id = p_user
     where eb.user_id = p_user and eb."deletedAt" is null
       and ((le.direction = 1 and le.origin <> 3) or le.origin = 6) and le."deletedAt" is null
     group by eb."bucketId"
  ),
  ci as (select "toBucketId" as b, sum("amountMinor")::bigint as s from public.bucket_covers where user_id = p_user and "deletedAt" is null group by 1),
  co as (select "fromBucketId" as b, sum("amountMinor")::bigint as s from public.bucket_covers where user_id = p_user and "deletedAt" is null group by 1)
  select bk.id, coalesce(al.s, 0), coalesce(sp.s, 0), coalesce(ci.s, 0), coalesce(co.s, 0),
         coalesce(al.s, 0) - coalesce(sp.s, 0) + coalesce(ci.s, 0) - coalesce(co.s, 0)
    from public.buckets bk
    left join al on al.b = bk.id
    left join sp on sp.b = bk.id
    left join ci on ci.b = bk.id
    left join co on co.b = bk.id
   where bk.user_id = p_user and bk."deletedAt" is null
   order by bk."displayOrder", bk.id
$$;
create or replace function public.confirm_incomes(entry_ids text[])
returns setof public.allocations
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cycle uuid;
  e record;
  v_meta record;
  v_src record;
  v_job text;
  v_label text;
  v_plan text;
  v_date date;
  v_em uuid;
  v_one uuid;
  v_sw record;
  v_rd record;
  v_redirect boolean;
  v_total int;
  v_lines record;
  v_dest text;
  v_trace jsonb;
  v_alloc public.allocations;
  v_missing text;
  v_pending boolean;
  v_split jsonb;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if entry_ids is null or coalesce(array_length(entry_ids, 1), 0) = 0 then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:cycle:' || v_user::text, 0));

  select string_agg(x, ', ') into v_missing
    from unnest(entry_ids) x
   where not exists (select 1 from public.ledger_entries le
                      where le.id = x and le.user_id = v_user and le.direction = 0 and le.origin not in (3, 6) and le."deletedAt" is null);
  if v_missing is not null then
    raise exception 'income not found, not yours, not an inflow, or deleted: %', v_missing using errcode = 'P0002';
  end if;

  v_em := public.engine_emergency_bucket(v_user);

  for e in
    select le.* from public.ledger_entries le
     where le.user_id = v_user and le.id = any (entry_ids)
     order by le."occurredAt", le.id
  loop
    -- idempotent per entry: already confirmed entries are skipped
    continue when exists (select 1 from public.allocations a
                           where a.user_id = v_user and a."ledgerEntryId" = e.id and a."deletedAt" is null);

    select * into v_meta from public.income_meta m where m.user_id = v_user and m."ledgerEntryId" = e.id and m."deletedAt" is null;
    select * into v_src from public.income_sources s where s.user_id = v_user and s.id = v_meta."sourceId";
    v_job := coalesce(v_meta.job, v_src.rule);
    v_date := public.entry_local_date(e."occurredAt");
    v_label := format('income %s (%s centavos on %s, source %s)', e.id, e."amountMinor", v_date, coalesce(v_src.name, 'none'));

    if v_job is null or v_job = 'ask' then
      raise exception 'Needs a job: % has no job (rule: ask or no source). Pick one first.', v_label using errcode = 'P0001';
    end if;

    v_plan := null;
    v_redirect := false;
    v_trace := jsonb_build_object('job', v_job, 'jobFrom', case when v_meta.job is not null then 'income' else 'source' end,
                                  'sourceId', v_src.id, 'sourceName', v_src.name, 'sourceRule', v_src.rule, 'onDate', v_date);

    v_split := '[]'::jsonb;

    if v_job = 'plan' then
      v_plan := public.active_plan(v_user);
      select (r.params ->> 'fromBucketId')::uuid as from_id, coalesce((r.params ->> 'toBucketId')::uuid, v_em) as to_id,
             (r.params ->> 'untilDate')::date as until_date
        into v_rd from public.allocation_rules r
       where r.user_id = v_user and r.kind = 'redirect_until_date' and r."deletedAt" is null
       order by r."createdAt", r.id limit 1;
      v_redirect := v_rd.until_date is not null and v_date < v_rd.until_date;
      select (r.params ->> 'targetMinor')::bigint as target, coalesce((r.params ->> 'bucketId')::uuid, v_em) as bucket_id
        into v_sw from public.allocation_rules r
       where r.user_id = v_user and r.kind = 'switch_on_goal' and r."deletedAt" is null
       order by r."createdAt", r.id limit 1;
      v_trace := v_trace || jsonb_build_object(
        'planKey', v_plan,
        'redirect', jsonb_build_object('applied', v_redirect, 'untilDate', v_rd.until_date, 'fromBucketId', v_rd.from_id, 'toBucketId', v_rd.to_id),
        'switch', jsonb_build_object('targetMinor', v_sw.target, 'bucketId', v_sw.bucket_id,
                   'measureMinor', case when v_sw.bucket_id is null then null else public.engine_plan_measure(v_user, v_sw.bucket_id) end),
        'remainderBucketId', v_em);
      select coalesce(jsonb_agg(jsonb_build_object('bucket_id', t.bucket_id, 'amount', t.amount, 'percent_bp', t.percent_bp)), '[]')
        into v_split from public.engine_split_plan(v_user, e."amountMinor", v_plan, v_date) t;
    elsif v_job = 'own' then
      if v_src.id is null then raise exception 'Needs a job: % uses an own split but has no source', v_label using errcode = 'P0001'; end if;
      select coalesce(sum(l."percentBp"), 0) into v_total from public.income_source_split_lines l
       where l."sourceId" = v_src.id and l.user_id = v_user and l."deletedAt" is null;
      if v_total <> 10000 then
        raise exception 'Needs a job: % has an own split that adds to % percent, not 100. Fix it in Plans.', v_label, (v_total / 100.0)::numeric(6,2) using errcode = 'P0001';
      end if;
      v_trace := v_trace || jsonb_build_object('ownTotalBp', v_total);
      select coalesce(jsonb_agg(jsonb_build_object('bucket_id', t.bucket_id, 'amount', t.amount, 'percent_bp', t.percent_bp)), '[]')
        into v_split from public.engine_split_own(v_user, e."amountMinor", v_src.id) t;
    elsif v_job = 'whole' then
      if v_src.id is null or v_src."wholeBucketId" is null then
        raise exception 'Needs a job: % is kept whole but its source has no bucket', v_label using errcode = 'P0001';
      end if;
      v_split := jsonb_build_array(jsonb_build_object('bucket_id', v_src."wholeBucketId", 'amount', e."amountMinor", 'percent_bp', 10000));
    elsif v_job = 'one' then
      v_one := coalesce(v_meta."oneBucketId", v_em);
      if v_one is null then raise exception 'Needs a job: % has no bucket to go to', v_label using errcode = 'P0001'; end if;
      if v_one = public.engine_rent_bucket(v_user) then
        raise exception 'Rent cannot be picked for a one-off income (%)', v_label using errcode = 'P0001';
      end if;
      v_split := jsonb_build_array(jsonb_build_object('bucket_id', v_one, 'amount', e."amountMinor", 'percent_bp', 10000));
    else
      raise exception 'unknown job % for %', v_job, v_label;
    end if;

    -- the cycle this confirm joins: the open one, or open a new one (P-3)
    v_cycle := (select id from public.transfer_cycles where user_id = v_user and "closedAt" is null and "deletedAt" is null limit 1);
    if v_cycle is null then
      insert into public.transfer_cycles (user_id) values (v_user) returning id into v_cycle;
    end if;

    for v_lines in
      select x.bucket_id, sum(x.amount)::bigint as amount, max(x.percent_bp) as percent_bp
        from jsonb_to_recordset(v_split) as x(bucket_id uuid, amount bigint, percent_bp int)
       where x.amount > 0 group by x.bucket_id
       order by (select b."displayOrder" from public.buckets b where b.id = x.bucket_id), x.bucket_id
    loop
      select b."keptInAccountId" into v_dest from public.buckets b where b.id = v_lines.bucket_id and b.user_id = v_user;
      if v_dest is null then
        raise exception 'Bucket % has no "kept in" account; set one before confirming %', v_lines.bucket_id, v_label using errcode = 'P0001';
      end if;
      insert into public.allocations (user_id, "ledgerEntryId", "bucketId", "amountMinor", "destAccountId", "planKey",
                                      "percentBp", "ruleTrace", "confirmedAt", "transferCycleId")
      values (v_user, e.id, v_lines.bucket_id, v_lines.amount, v_dest, v_plan, v_lines.percent_bp,
              v_trace || jsonb_build_object('destAccountId', v_dest), public.now_ms(), v_cycle)
      returning * into v_alloc;
      return next v_alloc;
    end loop;
  end loop;

  -- a cycle with nothing left to send (everything is "keep") closes right away
  v_cycle := (select id from public.transfer_cycles where user_id = v_user and "closedAt" is null and "deletedAt" is null limit 1);
  if v_cycle is not null then
    select exists (select 1 from public.engine_transfer_plan(v_user, v_cycle) t where t.kind = 'transfer' and not t.done) into v_pending;
    if not v_pending then
      update public.transfer_cycles set "closedAt" = public.now_ms(), "updatedAt" = public.now_ms() where id = v_cycle;
    end if;
  end if;
  return;
end;
$$;
create or replace function public.engine_waiting_income(p_user uuid)
returns table(entry_id text, amount bigint, occurred_at bigint, source_id uuid)
language sql stable security invoker set search_path = public
as $$
  select le.id, le."amountMinor", le."occurredAt", im."sourceId"
    from public.income_meta im
    join public.ledger_entries le on le.id = im."ledgerEntryId" and le.user_id = p_user
   where im.user_id = p_user and im."deletedAt" is null
     and le."deletedAt" is null and le.direction = 0 and le.origin not in (3, 6)
     and not exists (select 1 from public.allocations a
                      where a.user_id = p_user and a."ledgerEntryId" = le.id and a."deletedAt" is null)
$$;
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

  select coalesce(sum((case when le.direction = 1 then le."amountMinor" else -le."amountMinor" end)) filter (where le."occurredAt" >= p_from), 0),
         coalesce(sum((case when le.direction = 1 then le."amountMinor" else -le."amountMinor" end)) filter (where le."occurredAt" < p_from), 0)
    into v_sp_week, v_sp_before
    from public.entry_buckets eb
    join public.ledger_entries le on le.id = eb."ledgerEntryId" and le.user_id = v_user
    join public.buckets bk on bk.id = eb."bucketId" and bk.user_id = v_user and bk."deletedAt" is null
   where eb.user_id = v_user and eb."deletedAt" is null
     and ((le.direction = 1 and le.origin <> 3) or le.origin = 6) and le."deletedAt" is null;

  return query select v_in_week + (v_in_before - v_sp_before), v_in_before - v_sp_before, v_sp_week, v_wait, v_hist, v_src;
end;
$$;
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
    select eb."bucketId" as b, sum((case when le.direction = 1 then le."amountMinor" else -le."amountMinor" end))::bigint as s
      from public.entry_buckets eb
      join public.ledger_entries le on le.id = eb."ledgerEntryId" and le.user_id = v_user
     where eb.user_id = v_user and eb."deletedAt" is null and ((le.direction = 1 and le.origin <> 3) or le.origin = 6) and le."deletedAt" is null
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
  select eb."bucketId", le."categoryId", (case when le.origin = 6 then 'Balance adjustment' else c.name end), sum((case when le.direction = 1 then le."amountMinor" else -le."amountMinor" end))::bigint
    from public.entry_buckets eb
    join public.ledger_entries le on le.id = eb."ledgerEntryId" and le.user_id = v_user
    join public.buckets bk on bk.id = eb."bucketId" and bk.user_id = v_user and bk."deletedAt" is null
    left join public.categories c on c.id = le."categoryId" and c.user_id = v_user
   where eb.user_id = v_user and eb."deletedAt" is null and ((le.direction = 1 and le.origin <> 3) or le.origin = 6) and le."deletedAt" is null
     and le."occurredAt" >= p_from and le."occurredAt" < p_to
   group by eb."bucketId", le."categoryId", (case when le.origin = 6 then 'Balance adjustment' else c.name end)
   order by 4 desc, 3, 2;
end;
$$;
-- Map adjustments that already exist (none in prod yet). Idempotent.
select public.backfill_adjustment_buckets(u.user_id) from (select distinct user_id from public.ledger_entries where origin = 6) u;
