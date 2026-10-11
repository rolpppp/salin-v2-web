-- =============================================================================
-- Allocation engine + transfer functions (BUSINESS_RULES 2-5, DATA_MODEL 3).
-- Mirrors lib/money/{split,transfers,buckets}.ts byte for byte (tests/parity).
--
-- All functions are SECURITY INVOKER (RLS applies), search_path = public.
-- Binding decisions: P-1 (no negative lines), P-3 (transfer cycles),
-- P-4 (deleted incomes excluded from every number), D-14 (one measure function),
-- D-17 (rent redirect by income date).
--
-- Naming: input parameters are prefixed p_ because the result columns are called
-- bucket_id / amount (a plpgsql OUT column and an IN parameter cannot share a name).
--
-- Dates: an income's calendar date is its occurredAt (UTC ms) read in Asia/Manila
-- (the product is Philippine pesos), see entry_local_date(). One-line change if needed.
--
-- Bucket order (breaks every tie): buckets."displayOrder", then id.
-- =============================================================================

-- ---------------------------------------------------------------- small helpers

-- Public functions that take a user id may only be asked about the caller (RLS would hide
-- another user's rows anyway; this makes it an explicit error instead of a silent empty result).
create or replace function public.assert_self(p_user uuid)
returns uuid language plpgsql stable set search_path = public
as $$
begin
  if p_user is distinct from auth.uid() then
    raise exception 'not allowed: can only read your own data' using errcode = '42501';
  end if;
  return p_user;
end;
$$;

create or replace function public.entry_local_date(p_ms bigint)
returns date language sql stable set search_path = public
as $$ select (to_timestamp(p_ms::double precision / 1000) at time zone 'Asia/Manila')::date $$;

-- The Emergency bucket: the one the switch_on_goal rule points at, else hue 'emergency'.
create or replace function public.engine_emergency_bucket(p_user uuid)
returns uuid language sql stable set search_path = public
as $$
  select coalesce(
    (select b.id
       from public.allocation_rules r
       join public.buckets b on b.id = (r.params ->> 'bucketId')::uuid and b.user_id = p_user
      where r.user_id = p_user and r.kind = 'switch_on_goal' and r."deletedAt" is null
      order by r."createdAt", r.id limit 1),
    (select b.id from public.buckets b
      where b.user_id = p_user and b.hue = 'emergency' and b."deletedAt" is null
      order by b."displayOrder", b.id limit 1))
$$;

-- The Rent bucket (cannot be picked for a one-off income): redirect rule's fromBucketId, else hue 'rent'.
create or replace function public.engine_rent_bucket(p_user uuid)
returns uuid language sql stable set search_path = public
as $$
  select coalesce(
    (select b.id
       from public.allocation_rules r
       join public.buckets b on b.id = (r.params ->> 'fromBucketId')::uuid and b.user_id = p_user
      where r.user_id = p_user and r.kind = 'redirect_until_date' and r."deletedAt" is null
      order by r."createdAt", r.id limit 1),
    (select b.id from public.buckets b
      where b.user_id = p_user and b.hue = 'rent' and b."deletedAt" is null
      order by b."displayOrder", b.id limit 1))
$$;

-- BR 2.4 + P-1. Adds the remainder to shares[target]; a negative remainder is taken from the
-- target down to 0, then from the other lines in descending bp (ties: bucket order), each down to 0.
create or replace function public.engine_apply_remainder(p_shares bigint[], p_bps int[], p_target int, p_rem bigint)
returns bigint[] language plpgsql immutable set search_path = public
as $$
declare
  s bigint[] := p_shares;
  owed bigint;
  take bigint;
  i int;
begin
  if p_rem >= 0 then
    s[p_target] := s[p_target] + p_rem;
    return s;
  end if;
  owed := -p_rem;
  for i in
    select g from (
      select p_target as g, 0 as o
      union all
      select x, 1 from generate_series(1, array_length(p_shares, 1)) x where x <> p_target
    ) q
    order by o, (case when o = 1 then p_bps[g] else 0 end) desc, g
  loop
    exit when owed = 0;
    take := least(owed, greatest(0, s[i]));
    s[i] := s[i] - take;
    owed := owed - take;
  end loop;
  if owed <> 0 then raise exception 'split invariant broken: cannot absorb negative remainder'; end if;
  return s;
end;
$$;

-- round_half_up(amount * bp / 10000), exact.
create or replace function public.engine_bp_share(p_amount bigint, p_bp int)
returns bigint language sql immutable set search_path = public
as $$ select floor((2::numeric * p_amount * p_bp + 10000) / 20000)::bigint $$;

-- ---------------------------------------------------------------- split_by_plan

create or replace function public.engine_split_plan(p_user uuid, p_amount bigint, p_plan_key text, p_on_date date)
returns table(bucket_id uuid, amount bigint, percent_bp int)
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_plan uuid;
  v_em uuid;
  v_ids uuid[];
  v_bps int[];
  v_shares bigint[];
  v_n int;
  v_total int;
  v_rule record;
  v_from int;
  v_to int;
  v_em_idx int;
  v_target int;
  v_best int;
  i int;
begin
  if p_amount is null or p_amount < 0 then raise exception 'amount must be >= 0'; end if;
  select id into v_plan from public.allocation_plans
   where user_id = p_user and key = p_plan_key and "deletedAt" is null;
  if v_plan is null then raise exception 'plan % not found', p_plan_key; end if;
  v_em := public.engine_emergency_bucket(p_user);
  if v_em is null then raise exception 'no Emergency bucket (switch_on_goal rule or hue emergency)'; end if;

  if exists (select 1 from public.allocation_plan_lines
              where "planId" = v_plan and "deletedAt" is null group by "bucketId" having count(*) > 1) then
    raise exception 'duplicate plan line for a bucket in plan %', p_plan_key;
  end if;

  select array_agg(b.id order by b."displayOrder", b.id),
         array_agg(coalesce(l.bp, 0) order by b."displayOrder", b.id)
    into v_ids, v_bps
    from public.buckets b
    left join (select "bucketId", sum("percentBp")::int as bp from public.allocation_plan_lines
                where "planId" = v_plan and "deletedAt" is null group by "bucketId") l on l."bucketId" = b.id
   where b.user_id = p_user and (l."bucketId" is not null or (b."deletedAt" is null and not b."isArchived"));
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then raise exception 'no buckets'; end if;

  select coalesce(sum(x), 0) into v_total from unnest(v_bps) x;
  if v_total <> 10000 then raise exception 'plan % must total 10000 bp, got %', p_plan_key, v_total; end if;

  v_em_idx := array_position(v_ids, v_em);
  if v_em_idx is null then raise exception 'the Emergency bucket is not in the bucket list'; end if;

  -- Rent redirect (D-17): income dated before the rule's untilDate.
  select (r.params ->> 'fromBucketId')::uuid as from_id,
         coalesce((r.params ->> 'toBucketId')::uuid, v_em) as to_id,
         (r.params ->> 'untilDate')::date as until_date
    into v_rule
    from public.allocation_rules r
   where r.user_id = p_user and r.kind = 'redirect_until_date' and r."deletedAt" is null
   order by r."createdAt", r.id limit 1;
  if v_rule.until_date is not null and p_on_date < v_rule.until_date then
    v_from := array_position(v_ids, v_rule.from_id);
    v_to := array_position(v_ids, v_rule.to_id);
    if v_to is null then raise exception 'redirect target bucket is not in the bucket list'; end if;
    if v_from is not null and v_from <> v_to then
      v_bps[v_to] := v_bps[v_to] + v_bps[v_from];
      v_bps[v_from] := 0;
    end if;
  end if;

  v_shares := array[]::bigint[];
  for i in 1 .. v_n loop
    v_shares := v_shares || public.engine_bp_share(p_amount, v_bps[i]);
  end loop;

  if v_bps[v_em_idx] > 0 then
    v_target := v_em_idx;
  else
    v_best := 1;
    for i in 2 .. v_n loop
      if v_bps[i] > v_bps[v_best] then v_best := i; end if;
    end loop;
    v_target := v_best;
  end if;
  v_shares := public.engine_apply_remainder(v_shares, v_bps, v_target, p_amount - (select coalesce(sum(x), 0)::bigint from unnest(v_shares) x));

  return query select v_ids[g], v_shares[g], v_bps[g] from generate_series(1, v_n) g order by g;
end;
$$;

create or replace function public.split_by_plan(p_amount bigint, p_plan_key text, p_on_date date)
returns table(bucket_id uuid, amount bigint, percent_bp int)
language sql stable security invoker set search_path = public
as $$ select * from public.engine_split_plan(auth.uid(), p_amount, p_plan_key, p_on_date) $$;

-- ---------------------------------------------------------------- split_own

create or replace function public.engine_split_own(p_user uuid, p_amount bigint, p_source_id uuid)
returns table(bucket_id uuid, amount bigint, percent_bp int)
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_ids uuid[];
  v_bps int[];
  v_shares bigint[] := array[]::bigint[];
  v_n int;
  v_total int;
  v_best int := 1;
  i int;
begin
  if p_amount is null or p_amount < 0 then raise exception 'amount must be >= 0'; end if;
  if not exists (select 1 from public.income_sources where id = p_source_id and user_id = p_user) then
    raise exception 'income source % not found', p_source_id;
  end if;
  select coalesce(sum(l."percentBp"), 0) into v_total
    from public.income_source_split_lines l
   where l."sourceId" = p_source_id and l.user_id = p_user and l."deletedAt" is null;
  if v_total <> 10000 then
    raise exception 'Its split adds to % percent, fix it in Plans (own split must total exactly 100)', (v_total / 100.0)::numeric(6,2);
  end if;
  if exists (select 1 from public.income_source_split_lines l
              where l."sourceId" = p_source_id and l.user_id = p_user and l."deletedAt" is null
                and not exists (select 1 from public.buckets b where b.id = l."bucketId" and b.user_id = p_user)) then
    raise exception 'the own split of source % points at a bucket that is not yours', p_source_id using errcode = 'P0002';
  end if;
  select array_agg(l."bucketId" order by b."displayOrder", b.id, l.id),
         array_agg(l."percentBp" order by b."displayOrder", b.id, l.id)
    into v_ids, v_bps
    from public.income_source_split_lines l
    join public.buckets b on b.id = l."bucketId"
   where l."sourceId" = p_source_id and l.user_id = p_user and l."deletedAt" is null and l."percentBp" > 0;
  v_n := array_length(v_ids, 1);
  for i in 1 .. v_n loop
    v_shares := v_shares || public.engine_bp_share(p_amount, v_bps[i]);
    if v_bps[i] > v_bps[v_best] then v_best := i; end if;
  end loop;
  v_shares := public.engine_apply_remainder(v_shares, v_bps, v_best, p_amount - (select sum(x)::bigint from unnest(v_shares) x));
  return query select v_ids[g], v_shares[g], v_bps[g] from generate_series(1, v_n) g order by g;
end;
$$;

create or replace function public.split_own(p_amount bigint, p_source_id uuid)
returns table(bucket_id uuid, amount bigint, percent_bp int)
language sql stable security invoker set search_path = public
as $$ select * from public.engine_split_own(auth.uid(), p_amount, p_source_id) $$;

-- ---------------------------------------------------------------- active_plan (D-14)

-- THE measure behind the Plan B switch. D-14: sum of all Emergency allocations ever (withdrawals
-- ignored), excluding allocations of incomes the phone deleted (P-4). Change the measure here only.
create or replace function public.engine_plan_measure(p_user uuid, p_bucket uuid)
returns bigint language sql stable security invoker set search_path = public
as $$
  select coalesce(sum(a."amountMinor"), 0)::bigint
    from public.allocations a
    join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = p_user and le."deletedAt" is null
   where a.user_id = p_user and a."deletedAt" is null and a."bucketId" = p_bucket
$$;

create or replace function public.active_plan(p_user uuid default auth.uid())
returns text language plpgsql stable security invoker set search_path = public
as $$
declare
  r record;
  v_bucket uuid;
begin
  perform public.assert_self(p_user);
  select coalesce(r2.params ->> 'fromPlan', 'A') as from_plan,
         coalesce(r2.params ->> 'toPlan', 'B') as to_plan,
         (r2.params ->> 'bucketId')::uuid as bucket_id,
         (r2.params ->> 'targetMinor')::bigint as target
    into r
    from public.allocation_rules r2
   where r2.user_id = p_user and r2.kind = 'switch_on_goal' and r2."deletedAt" is null
   order by r2."createdAt", r2.id limit 1;
  if not found or r.target is null then return 'A'; end if;
  v_bucket := coalesce(r.bucket_id, public.engine_emergency_bucket(p_user));
  if v_bucket is null then return r.from_plan; end if;
  return case when public.engine_plan_measure(p_user, v_bucket) >= r.target then r.to_plan else r.from_plan end;
end;
$$;

-- ---------------------------------------------------------------- transfer cycles (P-3)

create or replace function public.engine_latest_cycle(p_user uuid)
returns uuid language sql stable security invoker set search_path = public
as $$ select id from public.transfer_cycles where user_id = p_user and "deletedAt" is null order by seq desc limit 1 $$;

-- ---------------------------------------------------------------- transfer_plan

-- One cycle's checklist, mirroring lib/money/transfers.ts transferPlan().
--   kind 'keep'     : from_account_id = to_account_id = the account; amount includes netted money
--   kind 'transfer' : from -> to, amount after netting, netted = amount that stays put on the other side
create or replace function public.engine_transfer_plan(p_user uuid, p_cycle uuid)
returns table(kind text, from_account_id text, to_account_id text, amount bigint, netted bigint, sent bigint,
              done boolean, status text, send_more bigint, bucket_ids uuid[], cycle_id uuid)
language sql stable security invoker set search_path = public
as $$
  with al as (
    select a.seq, le."accountId" as f, a."destAccountId" as d, a."amountMinor" as amt, a."bucketId" as b
      from public.allocations a
      join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = p_user
     where a.user_id = p_user and a."transferCycleId" = p_cycle and a."deletedAt" is null
       and le."deletedAt" is null and a."amountMinor" > 0 and a."destAccountId" is not null
  ),
  pairs as (
    select f, d, sum(amt)::bigint as amt, min(seq) as fs,
           (select array_agg(x.b order by x.mn) from (select b, min(seq) as mn from al a2 where a2.f = al.f and a2.d = al.d group by b) x) as bs
      from al where f <> d group by f, d
  ),
  sentc as (
    select "fromAccountId" as f, "toAccountId" as d, sum("sentMinor")::bigint as s
      from public.transfer_checks
     where user_id = p_user and "periodKey" = p_cycle::text and "deletedAt" is null
     group by 1, 2
  ),
  -- directed view of every pair that has a reverse pair; m is 0 when netting is blocked by a sent transfer (BR 3.5)
  nets as (
    select p.f, p.d, p.amt as pa, q.amt as qa, p.bs as pbs, q.bs as qbs, p.fs, q.fs as qfs,
           case when ((coalesce(sp.s, 0) > 0 and coalesce(sp.s, 0) <> p.amt - least(p.amt, q.amt))
                   or (coalesce(sq.s, 0) > 0 and coalesce(sq.s, 0) <> q.amt - least(p.amt, q.amt)))
                then 0 else least(p.amt, q.amt) end::bigint as m
      from pairs p
      join pairs q on q.f = p.d and q.d = p.f
      left join sentc sp on sp.f = p.f and sp.d = p.d
      left join sentc sq on sq.f = q.f and sq.d = q.d
  ),
  fin as (
    select p.f, p.d, p.fs, p.bs, p.amt - coalesce(n.m, 0) as amt, coalesce(n.m, 0) as m
      from pairs p left join nets n on n.f = p.f and n.d = p.d
  ),
  -- Netting events, in the order lib/money/transfers.ts creates them: for the pair that appears first
  -- in the allocations, its sender keeps m (for the other side's buckets), then the other sender.
  keep_amt as (
    select acct, sum(amount)::bigint as amount, sum(nt)::bigint as netted, min(o) as o from (
      select f as acct, sum(amt)::bigint as amount, 0::bigint as nt, min(seq)::numeric as o from al where f = d group by f
      union all
      select f, m, m, 1000000000000000 + 2 * fs from nets where m > 0 and fs < qfs
      union all
      select d, m, m, 1000000000000000 + 2 * fs + 1 from nets where m > 0 and fs < qfs
    ) u group by acct
  ),
  keep_lbl as (
    select acct, array_agg(b order by o) as bs from (
      select acct, b, min(o) as o from (
        select f as acct, b, seq::numeric as o from al where f = d
        union all
        select n.f, u.b, (1000000000000000 + 2 * n.fs)::numeric * 1000 + u.i
          from nets n, unnest(n.qbs) with ordinality as u(b, i) where n.m > 0 and n.fs < n.qfs
        union all
        select n.d, u.b, (1000000000000000 + 2 * n.fs + 1)::numeric * 1000 + u.i
          from nets n, unnest(n.pbs) with ordinality as u(b, i) where n.m > 0 and n.fs < n.qfs
      ) z group by acct, b
    ) y group by acct
  ),
  out_rows as (
    select 'keep'::text as kind, k.acct as f, k.acct as d, k.amount as amount, k.netted as netted,
           0::bigint as sent, true as done, 'keep'::text as status, 0::bigint as send_more,
           l.bs as bs, 0 as grp, k.o as o
      from keep_amt k join keep_lbl l on l.acct = k.acct
    union all
    select 'transfer', p.f, p.d, p.amt, p.m, coalesce(s.s, 0), coalesce(s.s, 0) = p.amt,
           case when coalesce(s.s, 0) = 0 then 'unsent' when s.s = p.amt then 'done' when s.s < p.amt then 'partial' else 'oversent' end,
           case when coalesce(s.s, 0) > 0 and s.s < p.amt then p.amt - s.s else 0 end,
           p.bs, 1, p.fs::numeric
      from fin p left join sentc s on s.f = p.f and s.d = p.d
     where p.amt > 0
  )
  select kind, f, d, amount, netted, sent, done, status, send_more, bs, p_cycle
    from out_rows order by grp, o, f, d
$$;

create or replace function public.transfer_plan(p_user uuid default auth.uid())
returns table(kind text, from_account_id text, to_account_id text, amount bigint, netted bigint, sent bigint,
              done boolean, status text, send_more bigint, bucket_ids uuid[], cycle_id uuid)
language sql stable security invoker set search_path = public
as $$ select * from public.engine_transfer_plan(public.assert_self(p_user), public.engine_latest_cycle(public.assert_self(p_user))) $$;

-- ---------------------------------------------------------------- bucket_left

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
    select eb."bucketId" as b, sum(le."amountMinor")::bigint as s
      from public.entry_buckets eb
      join public.ledger_entries le on le.id = eb."ledgerEntryId" and le.user_id = p_user
     where eb.user_id = p_user and eb."deletedAt" is null
       and le.direction = 1 and le.origin <> 3 and le."deletedAt" is null
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

create or replace function public.bucket_left(p_user uuid default auth.uid())
returns table(bucket_id uuid, allocated bigint, spent bigint, covers_in bigint, covers_out bigint, left_minor bigint)
language sql stable security invoker set search_path = public
as $$ select * from public.engine_bucket_left(public.assert_self(p_user)) $$;

-- ---------------------------------------------------------------- account_should_hold (BR 5.1)

create or replace function public.engine_account_should_hold(p_user uuid)
returns table(account_id text, currency text, allocated_here bigint, buckets_net bigint, should_hold bigint, bucket_kept_here boolean)
language sql stable security invoker set search_path = public
as $$
  with al as (
    select a."destAccountId" as acct, sum(a."amountMinor")::bigint as s
      from public.allocations a
      join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = p_user and le."deletedAt" is null
     where a.user_id = p_user and a."deletedAt" is null and a."destAccountId" is not null
     group by a."destAccountId"
  ),
  bk as (
    select b."keptInAccountId" as acct, sum(l.covers_in - l.covers_out - l.spent)::bigint as s, count(*) as n
      from public.engine_bucket_left(p_user) l
      join public.buckets b on b.id = l.bucket_id
     where b."keptInAccountId" is not null
     group by b."keptInAccountId"
  )
  select ac.id, ac.currency, coalesce(al.s, 0), coalesce(bk.s, 0), coalesce(al.s, 0) + coalesce(bk.s, 0), bk.n is not null
    from public.accounts ac
    left join al on al.acct = ac.id
    left join bk on bk.acct = ac.id
   where ac.user_id = p_user and ac."deletedAt" is null
   order by ac."displayOrder", ac.id
$$;

create or replace function public.account_should_hold(p_user uuid default auth.uid())
returns table(account_id text, currency text, allocated_here bigint, buckets_net bigint, should_hold bigint, bucket_kept_here boolean)
language sql stable security invoker set search_path = public
as $$ select * from public.engine_account_should_hold(public.assert_self(p_user)) $$;

-- ---------------------------------------------------------------- confirm_incomes

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
                      where le.id = x and le.user_id = v_user and le.direction = 0 and le.origin <> 3 and le."deletedAt" is null);
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

-- ---------------------------------------------------------------- tick / untick

create or replace function public.tick_transfer(p_from text, p_to text, p_amount bigint)
returns text
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cycle uuid;
  v_closed bigint;
  v_row record;
  v_old bigint;
  v_delta bigint;
  v_t text := gen_random_uuid()::text;
  v_now bigint := public.now_ms();
  v_pending boolean;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be > 0'; end if;
  if p_from = p_to then raise exception 'from and to must differ'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:cycle:' || v_user::text, 0));

  select id, "closedAt" into v_cycle, v_closed from public.transfer_cycles
   where user_id = v_user and "deletedAt" is null order by seq desc limit 1;
  if v_cycle is null or v_closed is not null then
    raise exception 'no open transfer cycle: nothing to send' using errcode = 'P0001';
  end if;
  if (select count(*) from public.accounts a where a.user_id = v_user and a.id in (p_from, p_to) and a."deletedAt" is null) <> 2 then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  select * into v_row from public.engine_transfer_plan(v_user, v_cycle) t
   where t.kind = 'transfer' and t.from_account_id = p_from and t.to_account_id = p_to;
  if not found then
    raise exception 'no transfer % -> % in the current checklist', p_from, p_to using errcode = 'P0002';
  end if;

  select coalesce(sum("sentMinor"), 0) into v_old from public.transfer_checks
   where user_id = v_user and "periodKey" = v_cycle::text and "fromAccountId" = p_from and "toAccountId" = p_to and "deletedAt" is null;
  if p_amount <= v_old then
    raise exception 'already sent % for this transfer; untick it first to change the amount', v_old using errcode = 'P0001';
  end if;
  v_delta := p_amount - v_old;   -- a "send more" tick moves only the difference

  -- mobile's shape (transaction_repository_impl.dart createTransfer): transfers row first, then T_out, T_in
  insert into public.transfers (id, user_id, "fromAccountId", "toAccountId", note, "createdAt", "updatedAt", "deletedAt", "syncStatus")
  values (v_t, v_user, p_from, p_to, 'Transfer', v_now, v_now, null, 2);
  insert into public.ledger_entries (id, user_id, "accountId", "transferId", "amountMinor", direction, origin, "occurredAt", note, "createdAt", "updatedAt", "syncStatus")
  values (v_t || '_out', v_user, p_from, v_t, v_delta, 1, 3, v_now, 'Transfer', v_now, v_now, 2),
         (v_t || '_in',  v_user, p_to,   v_t, v_delta, 0, 3, v_now, 'Transfer', v_now, v_now, 2);

  insert into public.transfer_checks (user_id, "fromAccountId", "toAccountId", "sentMinor", "transferId", "periodKey", "transferIds", "updatedAt")
  values (v_user, p_from, p_to, p_amount, v_t, v_cycle::text, array[v_t], v_now)
  on conflict (user_id, "periodKey", "fromAccountId", "toAccountId")
  do update set "sentMinor" = excluded."sentMinor", "transferId" = excluded."transferId", "updatedAt" = v_now,
                "transferIds" = case when public.transfer_checks."deletedAt" is null then public.transfer_checks."transferIds" || v_t else array[v_t] end,
                "deletedAt" = null;

  select exists (select 1 from public.engine_transfer_plan(v_user, v_cycle) t where t.kind = 'transfer' and not t.done) into v_pending;
  if not v_pending then
    update public.transfer_cycles set "closedAt" = v_now, "updatedAt" = v_now where id = v_cycle;
  end if;
  return v_t;
end;
$$;

create or replace function public.untick_transfer(p_from text, p_to text)
returns void
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cycle uuid;
  v_chk public.transfer_checks;
  v_now bigint := public.now_ms();
  v_ids text[];
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:cycle:' || v_user::text, 0));
  v_cycle := public.engine_latest_cycle(v_user);   -- only the latest cycle can be unticked (P-3)
  if v_cycle is null then raise exception 'no transfer cycle' using errcode = 'P0002'; end if;

  select * into v_chk from public.transfer_checks
   where user_id = v_user and "periodKey" = v_cycle::text and "fromAccountId" = p_from and "toAccountId" = p_to and "deletedAt" is null;
  if not found then
    raise exception 'nothing ticked for % -> % in the latest cycle', p_from, p_to using errcode = 'P0002';
  end if;

  v_ids := v_chk."transferIds";
  if v_chk."transferId" is not null and not (v_chk."transferId" = any (v_ids)) then v_ids := v_ids || v_chk."transferId"; end if;

  update public.transfers set "deletedAt" = v_now, "updatedAt" = v_now, "syncStatus" = 2
   where user_id = v_user and id = any (v_ids) and "deletedAt" is null;
  update public.ledger_entries set "deletedAt" = v_now, "updatedAt" = v_now, "syncStatus" = 2
   where user_id = v_user and "transferId" = any (v_ids) and "deletedAt" is null;
  update public.transfer_checks set "deletedAt" = v_now, "updatedAt" = v_now where id = v_chk.id;

  update public.transfer_cycles set "closedAt" = null, "updatedAt" = v_now where id = v_cycle and "closedAt" is not null;
end;
$$;

-- ---------------------------------------------------------------- cover_bucket

-- Validates and records a cover (BR 4.3). How much to cover is decided in TS (D-19).
create or replace function public.cover_bucket(p_from uuid, p_to uuid, p_amount bigint)
returns uuid
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_left bigint;
  v_id uuid;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'cover amount must be > 0'; end if;
  if p_from = p_to then raise exception 'cannot cover a bucket from itself'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:cover:' || v_user::text, 0));
  if (select count(*) from public.buckets b where b.user_id = v_user and b.id in (p_from, p_to) and b."deletedAt" is null) <> 2 then
    raise exception 'bucket not found' using errcode = 'P0002';
  end if;
  select l.left_minor into v_left from public.engine_bucket_left(v_user) l where l.bucket_id = p_from;
  if p_amount > coalesce(v_left, 0) then
    raise exception 'cannot cover % centavos: only % is left in the source bucket', p_amount, coalesce(v_left, 0) using errcode = 'P0001';
  end if;
  insert into public.bucket_covers (user_id, "fromBucketId", "toBucketId", "amountMinor")
  values (v_user, p_from, p_to, p_amount) returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- privileges
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and (p.proname like 'engine\_%' or p.proname in ('entry_local_date','assert_self','split_by_plan','split_own','active_plan','confirm_incomes',
            'bucket_left','transfer_plan','account_should_hold','tick_transfer','untick_transfer','cover_bucket'))
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
