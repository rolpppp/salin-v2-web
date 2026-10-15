-- Sort the money you already have (ticket 34, owner request Oct 16).
-- Money that came in before a plan sits in one bucket (Spending) even when it was already moved to the accounts the
-- new plan's buckets live in. Sorting re-labels it bucket by bucket WITHOUT moving it between accounts: a cover with
-- "atAccountId" set. Allocations stay append-only history; "left" per bucket picks the cover up as usual, and
-- "should be here" per account ignores these covers, because the money is already where it was sent.

alter table public.bucket_covers add column "atAccountId" text references public.accounts (id) on delete set null;
comment on column public.bucket_covers."atAccountId" is
  'Set when the cover only re-labels money already sitting in this account (sorting money from before a plan). Null: an ordinary cover.';
create index bucket_covers_ataccountid_idx on public.bucket_covers ("atAccountId");

-- ---------------------------------------------------------------- should hold (BR 5.1), sorted covers excluded
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
  -- Sorting covers net to zero inside the account they name, so they don't count toward the buckets' accounts.
  st as (
    select x.b, sum(x.s)::bigint as s from (
      select "toBucketId" as b, "amountMinor" as s from public.bucket_covers
       where user_id = p_user and "deletedAt" is null and "atAccountId" is not null
      union all
      select "fromBucketId", -"amountMinor" from public.bucket_covers
       where user_id = p_user and "deletedAt" is null and "atAccountId" is not null
    ) x group by x.b
  ),
  bk as (
    select b."keptInAccountId" as acct, sum(l.covers_in - l.covers_out - coalesce(st.s, 0) - l.spent)::bigint as s, count(*) as n
      from public.engine_bucket_left(p_user) l
      join public.buckets b on b.id = l.bucket_id
      left join st on st.b = l.bucket_id
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

-- ---------------------------------------------------------------- what is still unsorted
-- Per bucket and account: money given to the bucket but sent to an account the bucket is NOT kept in, less what was
-- already sorted out of it there. Only accounts that keep at least one other live bucket count (otherwise there is
-- nowhere to sort it to). Capped at nothing here; the caller caps by the bucket's left.
create or replace function public.engine_unsorted_money(p_user uuid)
returns table(bucket_id uuid, account_id text, amount_minor bigint)
language sql stable security invoker set search_path = public
as $$
  with sent as (
    select a."bucketId" as b, a."destAccountId" as acct, sum(a."amountMinor")::bigint as s
      from public.allocations a
      join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = p_user and le."deletedAt" is null
      join public.buckets bk on bk.id = a."bucketId" and bk."deletedAt" is null
     where a.user_id = p_user and a."deletedAt" is null and a."destAccountId" is not null
       and a."destAccountId" is distinct from bk."keptInAccountId"
     group by 1, 2
  ),
  sorted as (
    select "fromBucketId" as b, "atAccountId" as acct, sum("amountMinor")::bigint as s
      from public.bucket_covers
     where user_id = p_user and "deletedAt" is null and "atAccountId" is not null
     group by 1, 2
  )
  select sent.b, sent.acct, sent.s - coalesce(sorted.s, 0)
    from sent
    left join sorted on sorted.b = sent.b and sorted.acct = sent.acct
   where sent.s - coalesce(sorted.s, 0) > 0
     and exists (
       select 1 from public.buckets o
        where o.user_id = p_user and o."deletedAt" is null and o."isArchived" = false
          and o."keptInAccountId" = sent.acct and o.id <> sent.b
     )
   order by 1, 2
$$;

create or replace function public.unsorted_money(p_user uuid default auth.uid())
returns table(bucket_id uuid, account_id text, amount_minor bigint)
language sql stable security invoker set search_path = public
as $$ select * from public.engine_unsorted_money(public.assert_self(p_user)) $$;

-- ---------------------------------------------------------------- sort_money
-- p_lines: [{"from": bucket uuid, "to": bucket uuid, "account": account id, "amount": centavos}, ...]
-- One transaction: every line is checked first, then all covers are written. The target must be kept in that account
-- (that's where the money already is); each (from, account) can't sort more than is unsorted there; each from bucket
-- can't give more than it has left.
create or replace function public.sort_money(p_lines jsonb)
returns integer
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_line jsonb;
  v_from uuid;
  v_to uuid;
  v_acct text;
  v_amt bigint;
  v_count integer := 0;
  r record;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Nothing to sort.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 60 then raise exception 'Too many lines.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:cover:' || v_user::text, 0));

  for v_line in select * from jsonb_array_elements(p_lines) loop
    begin
      v_from := (v_line->>'from')::uuid;
      v_to := (v_line->>'to')::uuid;
      v_acct := v_line->>'account';
      v_amt := (v_line->>'amount')::bigint;
    exception when others then
      raise exception 'Each line needs from, to, account and a whole amount in centavos.' using errcode = '22023';
    end;
    if v_from is null or v_to is null or v_acct is null or v_amt is null then
      raise exception 'Each line needs from, to, account and a whole amount in centavos.' using errcode = '22023';
    end if;
    if v_amt <= 0 then raise exception 'Amounts must be above zero.' using errcode = '22023'; end if;
    if v_from = v_to then raise exception 'Pick a different bucket to sort into.' using errcode = '22023'; end if;
    if not exists (select 1 from public.buckets where id = v_from and user_id = v_user and "deletedAt" is null) then
      raise exception 'bucket not found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.buckets where id = v_to and user_id = v_user and "deletedAt" is null and "isArchived" = false
                     and "keptInAccountId" = v_acct) then
      raise exception 'That bucket is not kept in that account.' using errcode = 'P0001';
    end if;
  end loop;

  for r in
    select s.f, s.acct, sum(s.amt)::bigint as amt, coalesce(u.amount_minor, 0) as unsorted
      from (select (e->>'from')::uuid as f, (e->>'to')::uuid as t, e->>'account' as acct, (e->>'amount')::bigint as amt from jsonb_array_elements(p_lines) e) s
      left join public.engine_unsorted_money(v_user) u on u.bucket_id = s.f and u.account_id = s.acct
     group by s.f, s.acct, u.amount_minor
  loop
    if r.amt > r.unsorted then
      raise exception 'Only % centavos there are still unsorted.', r.unsorted using errcode = 'P0001';
    end if;
  end loop;

  for r in
    select s.f, sum(s.amt)::bigint as amt, coalesce(l.left_minor, 0) as left_minor
      from (select (e->>'from')::uuid as f, (e->>'to')::uuid as t, e->>'account' as acct, (e->>'amount')::bigint as amt from jsonb_array_elements(p_lines) e) s
      left join public.engine_bucket_left(v_user) l on l.bucket_id = s.f
     group by s.f, l.left_minor
  loop
    if r.amt > r.left_minor then
      raise exception 'Only % centavos are left in that bucket.', greatest(r.left_minor, 0) using errcode = 'P0001';
    end if;
  end loop;

  insert into public.bucket_covers (user_id, "fromBucketId", "toBucketId", "amountMinor", "atAccountId", note)
  select v_user, s.f, s.t, s.amt, s.acct, 'sorted' from (select (e->>'from')::uuid as f, (e->>'to')::uuid as t, e->>'account' as acct, (e->>'amount')::bigint as amt from jsonb_array_elements(p_lines) e) s;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- Review: sorting is not "covered this week"
-- Same as 20261012000200 except: covers in/out leave out sorting covers, and the week's change still includes them.
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
     where user_id = v_user and "deletedAt" is null and "atAccountId" is null and "occurredAt" >= p_from and "occurredAt" < p_to group by 1
  ), co as (
    select "fromBucketId" as b, sum("amountMinor")::bigint as s from public.bucket_covers
     where user_id = v_user and "deletedAt" is null and "atAccountId" is null and "occurredAt" >= p_from and "occurredAt" < p_to group by 1
  ), so as (
    -- Sorting (ticket 34) re-labels money that was already here: it changes a bucket's left, but it is not a cover.
    select x.b, sum(x.s)::bigint as s from (
      select "toBucketId" as b, "amountMinor" as s from public.bucket_covers
       where user_id = v_user and "deletedAt" is null and "atAccountId" is not null and "occurredAt" >= p_from and "occurredAt" < p_to
      union all
      select "fromBucketId", -"amountMinor" from public.bucket_covers
       where user_id = v_user and "deletedAt" is null and "atAccountId" is not null and "occurredAt" >= p_from and "occurredAt" < p_to
    ) x group by x.b
  )
  select bk.id, coalesce(al.s, 0), coalesce(sp.s, 0), coalesce(ci.s, 0), coalesce(co.s, 0),
         coalesce(al.s, 0) - coalesce(sp.s, 0) + coalesce(ci.s, 0) - coalesce(co.s, 0) + coalesce(so.s, 0)
    from public.buckets bk
    left join al on al.b = bk.id left join sp on sp.b = bk.id left join ci on ci.b = bk.id left join co on co.b = bk.id
    left join so on so.b = bk.id
   where bk.user_id = v_user and bk."deletedAt" is null
   order by bk."displayOrder", bk.id;
end;
$$;

revoke all on function public.engine_unsorted_money(uuid) from public, anon;
grant execute on function public.engine_unsorted_money(uuid) to authenticated;
revoke all on function public.unsorted_money(uuid) from public, anon;
grant execute on function public.unsorted_money(uuid) to authenticated;
revoke all on function public.sort_money(jsonb) from public, anon;
grant execute on function public.sort_money(jsonb) to authenticated;
