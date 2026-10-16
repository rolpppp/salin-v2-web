-- Starting money (ticket 38, P-14, owner request Oct 16).
-- Money already sitting in accounts (opening balances, phone entries, anything from before the plan) belongs to no
-- bucket. A "start" puts it into a bucket WITHOUT an income entry: like an allocation line with a destination account
-- ("accountId" = where the money already is), but it is not income and never appears in "Came in" as pay.
--   * bucket_starts is web-only (never synced to mobile). Soft delete only.
--   * engine_bucket_left folds starts into "allocated", so every caller (Today, Review, goals, Log spending) and the
--     left identity (allocated - spent + covers in - covers out) keep working with no signature change.
--   * engine_account_should_hold counts a start at its "accountId", the way an allocation counts at destAccountId.
--   * engine_unsorted_money treats a start at an account other than the bucket's kept-in account like a misplaced
--     allocation (ticket 34 can re-label it).
--   * Review: week_slip_figures lists starts as one source line, "Money you already had", so the slip reconciles in the
--     week they were sorted; week_bucket_flows counts them in "allocated".
-- No change to any of the 12 mobile-synced tables.

create table public.bucket_starts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "bucketId" uuid not null references public.buckets (id) on delete restrict,
  "accountId" text references public.accounts (id) on delete set null,
  "amountMinor" bigint not null check ("amountMinor" > 0),
  "batchId" uuid not null default gen_random_uuid(),
  note text,
  "occurredAt" bigint not null default public.now_ms(),
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);
create index bucket_starts_user_idx on public.bucket_starts (user_id);
create index bucket_starts_bucketid_idx on public.bucket_starts ("bucketId");
create index bucket_starts_accountid_idx on public.bucket_starts ("accountId");
create index bucket_starts_batchid_idx on public.bucket_starts ("batchId");

alter table public.bucket_starts enable row level security;
revoke all on public.bucket_starts from anon, authenticated;
create policy "bucket_starts_select_own" on public.bucket_starts for select to authenticated using (user_id = (select auth.uid()));
create policy "bucket_starts_insert_own" on public.bucket_starts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "bucket_starts_update_own" on public.bucket_starts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "bucket_starts_delete_own" on public.bucket_starts for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.bucket_starts to authenticated;
create trigger bucket_starts_set_updated_at before insert or update on public.bucket_starts
  for each row execute function public.set_updated_at_ms();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bucket_starts') then
    alter publication supabase_realtime add table public.bucket_starts;
  end if;
end $$;

-- ---------------------------------------------------------------- left: starts count as money in
-- Same as 20261012000200 except "allocated" also holds the bucket's live starting money.
create or replace function public.engine_bucket_left(p_user uuid)
returns table(bucket_id uuid, allocated bigint, spent bigint, covers_in bigint, covers_out bigint, left_minor bigint)
language sql stable security invoker set search_path = public
as $$
  with al as (
    select x.b, sum(x.s)::bigint as s from (
      select a."bucketId" as b, a."amountMinor" as s
        from public.allocations a
        join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = p_user and le."deletedAt" is null
       where a.user_id = p_user and a."deletedAt" is null
      union all
      select st."bucketId", st."amountMinor"
        from public.bucket_starts st
       where st.user_id = p_user and st."deletedAt" is null
    ) x group by x.b
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

-- ---------------------------------------------------------------- should hold: starts count where the money is
-- Same as 20261016000100 except "allocated_here" also counts starts at their "accountId".
create or replace function public.engine_account_should_hold(p_user uuid)
returns table(account_id text, currency text, allocated_here bigint, buckets_net bigint, should_hold bigint, bucket_kept_here boolean)
language sql stable security invoker set search_path = public
as $$
  with al as (
    select x.acct, sum(x.s)::bigint as s from (
      select a."destAccountId" as acct, a."amountMinor" as s
        from public.allocations a
        join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = p_user and le."deletedAt" is null
       where a.user_id = p_user and a."deletedAt" is null and a."destAccountId" is not null
      union all
      select st."accountId", st."amountMinor"
        from public.bucket_starts st
        join public.buckets bk on bk.id = st."bucketId" and bk."deletedAt" is null
       where st.user_id = p_user and st."deletedAt" is null and st."accountId" is not null
    ) x group by x.acct
  ),
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

-- ---------------------------------------------------------------- still unsorted: starts too
create or replace function public.engine_unsorted_money(p_user uuid)
returns table(bucket_id uuid, account_id text, amount_minor bigint)
language sql stable security invoker set search_path = public
as $$
  with sent0 as (
    select a."bucketId" as b, a."destAccountId" as acct, a."amountMinor" as s
      from public.allocations a
      join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = p_user and le."deletedAt" is null
     where a.user_id = p_user and a."deletedAt" is null and a."destAccountId" is not null
    union all
    select st."bucketId", st."accountId", st."amountMinor"
      from public.bucket_starts st
     where st.user_id = p_user and st."deletedAt" is null and st."accountId" is not null
  ),
  sent as (
    select sent0.b, sent0.acct, sum(sent0.s)::bigint as s
      from sent0
      join public.buckets bk on bk.id = sent0.b and bk."deletedAt" is null
     where sent0.acct is distinct from bk."keptInAccountId"
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

-- ---------------------------------------------------------------- Review
-- week_slip_figures: same as 20261012000200 plus starts as one source line, "Money you already had".
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
    union all
    -- Not income: money that was already in the accounts and was given a bucket. Listed on its own line.
    select st.id::text, st."occurredAt", st."amountMinor", 'Money you already had'
      from public.bucket_starts st
      join public.buckets bk on bk.id = st."bucketId" and bk.user_id = v_user and bk."deletedAt" is null
     where st.user_id = v_user and st."deletedAt" is null
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

-- week_bucket_flows: same as 20261016000100 except starts in the window count in "allocated" (by occurredAt).
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
    select x.b, sum(x.s)::bigint as s from (
      select a."bucketId" as b, a."amountMinor" as s
        from public.allocations a
        join public.ledger_entries le on le.id = a."ledgerEntryId" and le.user_id = v_user and le."deletedAt" is null
       where a.user_id = v_user and a."deletedAt" is null and a."confirmedAt" >= p_from and a."confirmedAt" < p_to
      union all
      select st."bucketId", st."amountMinor" from public.bucket_starts st
       where st.user_id = v_user and st."deletedAt" is null and st."occurredAt" >= p_from and st."occurredAt" < p_to
    ) x group by x.b
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

-- ---------------------------------------------------------------- real balance vs "by your buckets"
-- Per live (not archived) PHP account: what is really there (opening + inflows - outflows over live entries, the sum
-- lib/data/balances.ts computes), what the buckets say should be there, income that landed here and is still waiting
-- for a job, and the unbucketed money.
--   unbucketed = balance - should_hold, less the waiting income here (that money is "To assign", not starting money, and
--   confirming it would count it a second time). Positive: can be sorted into buckets. Negative: the buckets count more
--   than is there (never sortable).
create or replace function public.account_balances(p_user uuid default auth.uid())
returns table(account_id text, balance_minor bigint, should_hold_minor bigint, waiting_minor bigint, unbucketed_minor bigint)
language sql stable security invoker set search_path = public
as $$
  with u as (select public.assert_self(p_user) as id),
  mv as (
    select le."accountId" as acct, sum(case when le.direction = 0 then le."amountMinor" else -le."amountMinor" end)::bigint as s
      from public.ledger_entries le, u
     where le.user_id = u.id and le."deletedAt" is null
     group by le."accountId"
  ),
  wt as (
    select le."accountId" as acct, sum(w.amount)::bigint as s
      from u
      cross join lateral public.engine_waiting_income(u.id) w
      join public.ledger_entries le on le.id = w.entry_id and le.user_id = u.id
     group by le."accountId"
  ),
  x as (
    select ac.id, ac."displayOrder",
           (ac."openingBalanceMinor" + coalesce(mv.s, 0))::bigint as bal, h.should_hold as hold, coalesce(wt.s, 0)::bigint as wait
      from public.accounts ac
      join u on ac.user_id = u.id
      left join mv on mv.acct = ac.id
      left join wt on wt.acct = ac.id
      join public.engine_account_should_hold(u.id) h on h.account_id = ac.id
     where ac."deletedAt" is null and ac."isArchived" = false and ac.currency = 'PHP'
  )
  select x.id, x.bal, x.hold, x.wait,
         (case when x.bal - x.hold < 0 then x.bal - x.hold else greatest(x.bal - x.hold - x.wait, 0) end)::bigint
    from x
   order by x."displayOrder", x.id
$$;

-- ---------------------------------------------------------------- start_buckets
-- p_lines: [{"bucketId": uuid, "accountId": text, "amountMinor": centavos}, ...]. One transaction. Each line > 0, the
-- bucket is the user's, live and not archived, the account is the user's live PHP account, and the lines for one
-- account add up to no more than that account still has unbucketed. Returns the batch id (for Undo).
create or replace function public.start_buckets(p_lines jsonb)
returns uuid
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_line jsonb;
  v_bucket uuid;
  v_acct text;
  v_amt bigint;
  v_batch uuid := gen_random_uuid();
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
      v_bucket := (v_line->>'bucketId')::uuid;
      v_acct := v_line->>'accountId';
      v_amt := (v_line->>'amountMinor')::bigint;
    exception when others then
      raise exception 'Each line needs bucketId, accountId and a whole amount in centavos.' using errcode = '22023';
    end;
    if v_bucket is null or v_acct is null or v_amt is null then
      raise exception 'Each line needs bucketId, accountId and a whole amount in centavos.' using errcode = '22023';
    end if;
    if v_amt <= 0 then raise exception 'Amounts must be above zero.' using errcode = '22023'; end if;
    if not exists (select 1 from public.buckets where id = v_bucket and user_id = v_user and "deletedAt" is null) then
      raise exception 'bucket not found' using errcode = '42501';
    end if;
    if exists (select 1 from public.buckets where id = v_bucket and "isArchived") then
      raise exception 'That bucket is archived. Restore it first.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.accounts where id = v_acct and user_id = v_user and "deletedAt" is null and "isArchived" = false) then
      raise exception 'account not found' using errcode = '42501';
    end if;
    if exists (select 1 from public.accounts where id = v_acct and currency <> 'PHP') then
      raise exception 'Only pesos accounts can be sorted into buckets.' using errcode = 'P0001';
    end if;
  end loop;

  for r in
    select s.acct, sum(s.amt)::bigint as amt, coalesce(b.unbucketed_minor, 0) as free
      from (select e->>'accountId' as acct, (e->>'amountMinor')::bigint as amt from jsonb_array_elements(p_lines) e) s
      left join public.account_balances(v_user) b on b.account_id = s.acct
     group by s.acct, b.unbucketed_minor
  loop
    if r.amt > greatest(r.free, 0) then
      raise exception 'Only % centavos in that account is not in a bucket yet.', greatest(r.free, 0) using errcode = 'P0001';
    end if;
  end loop;

  insert into public.bucket_starts (user_id, "bucketId", "accountId", "amountMinor", "batchId", note)
  select v_user, (e->>'bucketId')::uuid, e->>'accountId', (e->>'amountMinor')::bigint, v_batch, 'start'
    from jsonb_array_elements(p_lines) e;
  return v_batch;
end;
$$;

-- ---------------------------------------------------------------- undo / remove
-- Soft delete. Allowed even when a bucket's left goes negative afterwards: it then shows "Needs P X", honestly.
create or replace function public.unsort_start(p_batch uuid)
returns integer
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_n integer;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_batch is null then raise exception 'batch is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:cover:' || v_user::text, 0));
  update public.bucket_starts set "deletedAt" = public.now_ms()
   where user_id = v_user and "batchId" = p_batch and "deletedAt" is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nothing to undo: that was already undone.' using errcode = 'P0002'; end if;
  return v_n;
end;
$$;

create or replace function public.remove_start(p_id uuid)
returns void
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_n integer;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_id is null then raise exception 'id is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:cover:' || v_user::text, 0));
  update public.bucket_starts set "deletedAt" = public.now_ms()
   where user_id = v_user and id = p_id and "deletedAt" is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'That line is not there any more.' using errcode = 'P0002'; end if;
end;
$$;

-- ---------------------------------------------------------------- move between buckets
-- A cover with note 'move' (BR 4.3 covers net to zero; Buffer-only is just the offer, not the rule).
create or replace function public.move_between_buckets(p_from uuid, p_to uuid, p_amount bigint)
returns uuid
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_left bigint;
  v_id uuid;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amounts must be above zero.' using errcode = '22023'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'Pick a different bucket to move it to.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:cover:' || v_user::text, 0));
  if (select count(*) from public.buckets b where b.user_id = v_user and b.id in (p_from, p_to) and b."deletedAt" is null) <> 2 then
    raise exception 'bucket not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.buckets where id = p_to and "isArchived") then
    raise exception 'That bucket is archived. Restore it first.' using errcode = 'P0001';
  end if;
  select l.left_minor into v_left from public.engine_bucket_left(v_user) l where l.bucket_id = p_from;
  if p_amount > greatest(coalesce(v_left, 0), 0) then
    raise exception 'Only % centavos are left in that bucket.', greatest(coalesce(v_left, 0), 0) using errcode = 'P0001';
  end if;
  insert into public.bucket_covers (user_id, "fromBucketId", "toBucketId", "amountMinor", note)
  values (v_user, p_from, p_to, p_amount, 'move') returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.account_balances(uuid) from public, anon;
grant execute on function public.account_balances(uuid) to authenticated;
revoke all on function public.start_buckets(jsonb) from public, anon;
grant execute on function public.start_buckets(jsonb) to authenticated;
revoke all on function public.unsort_start(uuid) from public, anon;
grant execute on function public.unsort_start(uuid) to authenticated;
revoke all on function public.remove_start(uuid) from public, anon;
grant execute on function public.remove_start(uuid) to authenticated;
revoke all on function public.move_between_buckets(uuid, uuid, bigint) from public, anon;
grant execute on function public.move_between_buckets(uuid, uuid, bigint) to authenticated;
revoke all on function public.engine_bucket_left(uuid) from public, anon;
grant execute on function public.engine_bucket_left(uuid) to authenticated;
revoke all on function public.engine_account_should_hold(uuid) from public, anon;
grant execute on function public.engine_account_should_hold(uuid) to authenticated;
revoke all on function public.week_slip_figures(bigint) from public, anon;
grant execute on function public.week_slip_figures(bigint) to authenticated;
revoke all on function public.week_bucket_flows(bigint, bigint) from public, anon;
grant execute on function public.week_bucket_flows(bigint, bigint) to authenticated;
