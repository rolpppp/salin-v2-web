-- =============================================================================
-- Ticket 13: Plans -> Accounts, Categories, Goals.
-- Server-side rules the UI only mirrors:
--   * an account / category / goal cannot be archived or removed while in use (BR 5.3, 6.3)
--   * moving a category freezes the bucket of every entry logged so far (BR 4.1, 6.2)
--   * a goal's links must point at the caller's own buckets (cross-user ids are NOT FK-guarded)
-- Rules from engine_functions: SECURITY INVOKER (RLS applies), explicit ownership checks,
-- integer money, updatedAt set explicitly, soft delete only. Never alters the synced tables' schema.
-- Error codes: 28000 not signed in, P0002 not found / not yours, P0001 refused (in use / invalid),
-- 23505 duplicate name.
-- =============================================================================

-- ---------------------------------------------------------------- accounts (BR 5.3)

-- The first reason an account can't be archived, or null. Order: bucket kept here, source lands here,
-- waiting income landed here, open transfer touches it, it holds money (G12: money from earlier paydays
-- still counts after "kept in" moved away).
create or replace function public.account_in_use_reason(p_account text)
returns text language plpgsql stable security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_txt text;
  v_bal bigint;
  v_hold bigint;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not exists (select 1 from public.accounts a where a.id = p_account and a.user_id = v_user and a."deletedAt" is null) then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  select b.name into v_txt from public.buckets b
   where b.user_id = v_user and b."keptInAccountId" = p_account and b."deletedAt" is null and not b."isArchived"
   order by b."displayOrder", b.id limit 1;
  if v_txt is not null then return v_txt || ' is kept here'; end if;

  select s.name into v_txt from public.income_sources s
   where s.user_id = v_user and s."landsInAccountId" = p_account and s."deletedAt" is null and not s."isArchived"
   order by s."createdAt", s.id limit 1;
  if v_txt is not null then return v_txt || ' lands here'; end if;

  if exists (
    select 1 from public.income_meta m
      join public.ledger_entries le on le.id = m."ledgerEntryId" and le.user_id = v_user
     where m.user_id = v_user and m."deletedAt" is null and le."deletedAt" is null and le."accountId" = p_account
       and not exists (select 1 from public.allocations al where al.user_id = v_user and al."ledgerEntryId" = le.id and al."deletedAt" is null)
  ) then return 'an income that landed here is still waiting for a job'; end if;

  if exists (
    select 1 from public.engine_transfer_plan(v_user, public.engine_latest_cycle(v_user)) t
     where t.kind = 'transfer' and not t.done and p_account in (t.from_account_id, t.to_account_id)
  ) then return 'a transfer to or from it is still open'; end if;

  select coalesce(a."openingBalanceMinor", 0) + coalesce(sum(case when le.direction = 0 then le."amountMinor" else -le."amountMinor" end), 0)
    into v_bal
    from public.accounts a
    left join public.ledger_entries le on le."accountId" = a.id and le.user_id = v_user and le."deletedAt" is null
   where a.id = p_account and a.user_id = v_user
   group by a.id, a."openingBalanceMinor";
  select h.should_hold into v_hold from public.engine_account_should_hold(v_user) h where h.account_id = p_account;
  if coalesce(v_bal, 0) <> 0 or coalesce(v_hold, 0) <> 0 then return 'it holds money'; end if;

  return null;
end;
$$;

create or replace function public.archive_account(p_account text)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reason text;
begin
  v_reason := public.account_in_use_reason(p_account);  -- also checks signed in + ownership
  if v_reason is not null then
    raise exception 'in use: %', v_reason using errcode = 'P0001';
  end if;
  update public.accounts set "isArchived" = true, "updatedAt" = public.now_ms()
   where id = p_account and user_id = v_user and "deletedAt" is null;
end;
$$;

create or replace function public.restore_account(p_account text)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select a.name into v_name from public.accounts a where a.id = p_account and a.user_id = v_user and a."deletedAt" is null;
  if not found then raise exception 'account not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.accounts a where a.user_id = v_user and a.id <> p_account and a."deletedAt" is null
              and not a."isArchived" and lower(btrim(a.name)) = lower(btrim(v_name))) then
    raise exception 'another account is already called %', v_name using errcode = '23505';
  end if;
  update public.accounts set "isArchived" = false, "updatedAt" = public.now_ms()
   where id = p_account and user_id = v_user;
end;
$$;

-- One call for the Accounts screen: the reason (or null) for every account that can still be archived.
create or replace function public.accounts_in_use(p_user uuid default auth.uid())
returns table(account_id text, reason text)
language sql stable security invoker set search_path = public
as $$
  select a.id, public.account_in_use_reason(a.id)
    from public.accounts a
   where a.user_id = public.assert_self(p_user) and a."deletedAt" is null and not a."isArchived"
   order by a."displayOrder", a.id
$$;

-- ---------------------------------------------------------------- categories (BR 6)

create or replace function public.category_in_use_reason(p_category text)
returns text language plpgsql stable security invoker set search_path = public
as $$
declare v_user uuid := auth.uid(); v_txt text;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not exists (select 1 from public.categories c where c.id = p_category and c.user_id = v_user and c."deletedAt" is null) then
    raise exception 'category not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ledger_entries le where le.user_id = v_user and le."categoryId" = p_category and le."deletedAt" is null) then
    return 'it has entries';
  end if;
  select s.name into v_txt from public.income_sources s
   where s.user_id = v_user and s."categoryId" = p_category and s."deletedAt" is null and not s."isArchived" limit 1;
  if v_txt is not null then return v_txt || ' uses it to recognise income'; end if;
  if exists (select 1 from public.recurring_rules r where r.user_id = v_user and r."categoryId" = p_category and r."deletedAt" is null) then
    return 'a recurring bill uses it';
  end if;
  if exists (select 1 from public.budget_categories bc where bc.user_id = v_user and bc."categoryId" = p_category) then
    return 'a budget on your phone uses it';
  end if;
  return null;
end;
$$;

create or replace function public.remove_category(p_category text)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reason text;
  v_now bigint := public.now_ms();
begin
  v_reason := public.category_in_use_reason(p_category);
  if v_reason is not null then
    raise exception 'in use: %', v_reason using errcode = 'P0001';
  end if;
  update public.categories set "deletedAt" = v_now, "updatedAt" = v_now where id = p_category and user_id = v_user;
  update public.category_buckets set "deletedAt" = v_now, "updatedAt" = v_now
   where user_id = v_user and "categoryId" = p_category and "deletedAt" is null;
end;
$$;

-- Puts an expense category in a bucket (first mapping, or a move). Returns how many entries were
-- newly snapshotted into a bucket by the backfill.
--   move : backfill FIRST so every entry logged so far is frozen in the OLD bucket, then remap (BR 4.1/6.2)
--   first: map, then backfill, so entries logged before any mapping existed land in the chosen bucket
-- Entries that already have an entry_buckets row (including overrides) are never touched.
create or replace function public.move_category(p_category text, p_bucket uuid)
returns int language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_old uuid;
  v_n int;
  v_now bigint := public.now_ms();
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:category:' || v_user::text, 0));
  if not exists (select 1 from public.categories c where c.id = p_category and c.user_id = v_user and c."deletedAt" is null and c."categoryType" = 1) then
    raise exception 'category not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.buckets b where b.id = p_bucket and b.user_id = v_user and b."deletedAt" is null and not b."isArchived") then
    raise exception 'bucket not found' using errcode = 'P0002';
  end if;

  select cb."bucketId" into v_old from public.category_buckets cb
   where cb.user_id = v_user and cb."categoryId" = p_category and cb."deletedAt" is null;
  if v_old = p_bucket then return 0; end if;

  if v_old is not null then
    v_n := public.backfill_entry_buckets(v_user);
    update public.category_buckets set "bucketId" = p_bucket, source = 'user', "updatedAt" = v_now
     where user_id = v_user and "categoryId" = p_category and "deletedAt" is null;
  else
    insert into public.category_buckets (user_id, "categoryId", "bucketId", source, "updatedAt")
    values (v_user, p_category, p_bucket, 'user', v_now)
    on conflict (user_id, "categoryId")
    do update set "bucketId" = excluded."bucketId", source = 'user', "deletedAt" = null, "updatedAt" = v_now;
    v_n := public.backfill_entry_buckets(v_user);
  end if;
  return v_n;
end;
$$;

create or replace function public.categories_in_use(p_user uuid default auth.uid())
returns table(category_id text, reason text)
language sql stable security invoker set search_path = public
as $$
  select c.id, public.category_in_use_reason(c.id)
    from public.categories c
   where c.user_id = public.assert_self(p_user) and c."deletedAt" is null and c."categoryType" = 1
   order by c."displayOrder", c.id
$$;

-- Spending in [p_from, p_to) (ms), per category and per the bucket each entry was snapshotted into (BR 4.1),
-- falling back to the category's current bucket for entries with no snapshot. total_minor counts only
-- accounts in p_currency (no mixing currencies); entries counts all.
create or replace function public.category_month_spend(p_from bigint, p_to bigint, p_currency text default 'PHP')
returns table(category_id text, bucket_id uuid, entries int, total_minor bigint)
language sql stable security invoker set search_path = public
as $$
  select le."categoryId", coalesce(eb."bucketId", cb."bucketId"), count(*)::int,
         coalesce(sum(case when a.currency = p_currency then le."amountMinor" else 0 end), 0)::bigint
    from public.ledger_entries le
    join public.accounts a on a.id = le."accountId" and a.user_id = le.user_id
    left join public.entry_buckets eb on eb.user_id = le.user_id and eb."ledgerEntryId" = le.id and eb."deletedAt" is null
    left join public.category_buckets cb on cb.user_id = le.user_id and cb."categoryId" = le."categoryId" and cb."deletedAt" is null
   where le.user_id = auth.uid() and le.direction = 1 and le.origin <> 3 and le."deletedAt" is null
     and le."categoryId" is not null and le."occurredAt" >= p_from and le."occurredAt" < p_to
   group by le."categoryId", coalesce(eb."bucketId", cb."bucketId")
$$;

-- ---------------------------------------------------------------- goals (BR 7)

create or replace function public.goal_check_links(p_user uuid, p_bucket uuid, p_share_bp int)
returns void language plpgsql stable security invoker set search_path = public
as $$
begin
  if p_share_bp is null or p_share_bp < 0 or p_share_bp > 10000 then
    raise exception 'share must be between 0 and 100 percent' using errcode = 'P0001';
  end if;
  if p_bucket is not null and not exists (select 1 from public.buckets b where b.id = p_bucket and b.user_id = p_user and b."deletedAt" is null) then
    raise exception 'bucket not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.add_goal(p_name text, p_target bigint, p_bucket uuid default null, p_share_bp int default 10000)
returns uuid language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'name must be 1 to 60 characters' using errcode = 'P0001'; end if;
  if p_target is null or p_target <= 0 then raise exception 'target must be more than 0' using errcode = 'P0001'; end if;
  perform public.goal_check_links(v_user, p_bucket, p_share_bp);
  if exists (select 1 from public.goals g where g.user_id = v_user and g."deletedAt" is null and not g."isArchived" and lower(btrim(g.name)) = lower(v_name)) then
    raise exception 'a goal called % already exists', v_name using errcode = '23505';
  end if;
  insert into public.goals (user_id, name, "targetMinor", "linkedBucketId", "linkedShareBp", "createdAt", "updatedAt")
  values (v_user, v_name, p_target, p_bucket, p_share_bp, public.now_ms(), public.now_ms())
  returning id into v_id;
  return v_id;
end;
$$;

-- Full replace of the editable fields. The Plan B switch goal keeps its target and the switch_on_goal rule
-- in step (BR 7.2: one value, edited in either place).
create or replace function public.update_goal(p_goal uuid, p_name text, p_target bigint, p_bucket uuid, p_share_bp int)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_goal public.goals;
  v_now bigint := public.now_ms();
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v_goal from public.goals g where g.id = p_goal and g.user_id = v_user and g."deletedAt" is null;
  if not found then raise exception 'goal not found' using errcode = 'P0002'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'name must be 1 to 60 characters' using errcode = 'P0001'; end if;
  if p_target is null or p_target <= 0 then raise exception 'target must be more than 0' using errcode = 'P0001'; end if;
  perform public.goal_check_links(v_user, p_bucket, p_share_bp);
  if exists (select 1 from public.goals g where g.user_id = v_user and g.id <> p_goal and g."deletedAt" is null and not g."isArchived"
              and lower(btrim(g.name)) = lower(v_name)) then
    raise exception 'a goal called % already exists', v_name using errcode = '23505';
  end if;
  update public.goals set name = v_name, "targetMinor" = p_target, "linkedBucketId" = p_bucket, "linkedShareBp" = p_share_bp, "updatedAt" = v_now
   where id = p_goal and user_id = v_user;
  if v_goal."isPlanSwitch" then
    update public.allocation_rules
       set params = jsonb_set(params, '{targetMinor}', to_jsonb(p_target)), "updatedAt" = v_now
     where user_id = v_user and kind = 'switch_on_goal' and "deletedAt" is null;
  end if;
end;
$$;

-- The goal that is the Plan B switch can't be archived (it would orphan the rule).
create or replace function public.archive_goal(p_goal uuid)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare v_user uuid := auth.uid(); v_goal public.goals;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v_goal from public.goals g where g.id = p_goal and g.user_id = v_user and g."deletedAt" is null;
  if not found then raise exception 'goal not found' using errcode = 'P0002'; end if;
  if v_goal."isPlanSwitch" then
    raise exception 'in use: it is your Plan B switch' using errcode = 'P0001';
  end if;
  update public.goals set "isArchived" = true, "updatedAt" = public.now_ms() where id = p_goal and user_id = v_user;
end;
$$;

create or replace function public.restore_goal(p_goal uuid)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare v_user uuid := auth.uid(); v_name text;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select g.name into v_name from public.goals g where g.id = p_goal and g.user_id = v_user and g."deletedAt" is null;
  if not found then raise exception 'goal not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.goals g where g.user_id = v_user and g.id <> p_goal and g."deletedAt" is null and not g."isArchived"
              and lower(btrim(g.name)) = lower(btrim(v_name))) then
    raise exception 'a goal called % already exists', v_name using errcode = '23505';
  end if;
  update public.goals set "isArchived" = false, "updatedAt" = public.now_ms() where id = p_goal and user_id = v_user;
end;
$$;

-- ---------------------------------------------------------------- privileges
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('account_in_use_reason','archive_account','restore_account','category_in_use_reason','remove_category',
                         'move_category','goal_check_links','add_goal','update_goal','archive_goal','restore_goal','accounts_in_use','categories_in_use','category_month_spend')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
