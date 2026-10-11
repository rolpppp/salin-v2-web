-- =============================================================================
-- Plans -> Split plan + Rules (SPEC 4.1, BR 9, ROADMAP ticket 8).
--
-- Atomic save functions for the plan editor. All SECURITY INVOKER (RLS applies), search_path = public,
-- every one starts with assert_self(). Basis points only; updatedAt is set explicitly to server ms;
-- rows are soft-deleted, never removed.
--
-- None of them touches `allocations`: confirmed paydays are immutable snapshots (AGENTS 3.4), so an edit
-- here only affects money confirmed after it.
-- =============================================================================

-- Replaces one plan's percentages. The plan must total exactly 10000 bp or nothing is saved
-- (the last valid version stays active). p_lines: [{"bucketId": uuid, "percentBp": int}, ...].
-- Buckets omitted from p_lines get 0 (their line is soft-deleted). Planless and archived buckets are refused.
create or replace function public.save_plan_lines(p_plan_key text, p_lines jsonb)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan uuid;
  v_el jsonb;
  v_bucket uuid;
  v_bp int;
  v_total bigint := 0;
  v_ids uuid[] := array[]::uuid[];
  v_now bigint := public.now_ms();
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a json array' using errcode = '22023';
  end if;

  select id into v_plan from public.allocation_plans
   where user_id = v_user and key = p_plan_key and "deletedAt" is null;
  if v_plan is null then raise exception 'plan % not found', p_plan_key using errcode = 'P0002'; end if;

  for v_el in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_el) <> 'object' or (v_el ->> 'bucketId') is null
       or coalesce(v_el ->> 'percentBp', '') !~ '^\d{1,5}$' then
      raise exception 'each line needs a bucketId and an integer percentBp' using errcode = '22023';
    end if;
    begin
      v_bucket := (v_el ->> 'bucketId')::uuid;
    exception when invalid_text_representation then
      raise exception 'bucketId is not a uuid' using errcode = '22023';
    end;
    v_bp := (v_el ->> 'percentBp')::int;
    if v_bp not between 0 and 10000 then
      raise exception 'percent must be between 0 and 100' using errcode = '22023';
    end if;
    if v_bucket = any (v_ids) then
      raise exception 'a bucket appears twice in the plan' using errcode = '22023';
    end if;
    if not exists (select 1 from public.buckets b
                    where b.id = v_bucket and b.user_id = v_user and b."deletedAt" is null
                      and not b."isArchived" and not b.planless) then
      raise exception 'bucket % is not one of your plan buckets', v_bucket using errcode = '42501';
    end if;
    v_ids := v_ids || v_bucket;
    v_total := v_total + v_bp;
  end loop;

  if v_total <> 10000 then
    raise exception 'Plan % adds up to % percent. It must add up to 100 to be saved.', p_plan_key, trim_scale((v_total / 100.0)::numeric(6,2))
      using errcode = '22023';
  end if;

  -- Update lines that exist, insert the rest, soft-delete lines for buckets no longer in the plan.
  for v_el in select * from jsonb_array_elements(p_lines) loop
    v_bucket := (v_el ->> 'bucketId')::uuid;
    v_bp := (v_el ->> 'percentBp')::int;
    update public.allocation_plan_lines
       set "percentBp" = v_bp, "updatedAt" = v_now
     where user_id = v_user and "planId" = v_plan and "bucketId" = v_bucket and "deletedAt" is null
       and "percentBp" <> v_bp;
    if not exists (select 1 from public.allocation_plan_lines
                    where user_id = v_user and "planId" = v_plan and "bucketId" = v_bucket and "deletedAt" is null) then
      insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp", "createdAt", "updatedAt")
      values (v_user, v_plan, v_bucket, v_bp, v_now, v_now);
    end if;
  end loop;
  update public.allocation_plan_lines
     set "deletedAt" = v_now, "updatedAt" = v_now
   where user_id = v_user and "planId" = v_plan and "deletedAt" is null and not ("bucketId" = any (v_ids));
end;
$$;

-- Where a bucket is kept (its home account). Future paydays only: allocations keep the destination
-- they were confirmed with. The account must be yours, not archived and not deleted.
create or replace function public.set_bucket_kept_in(p_bucket uuid, p_account text)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.buckets b where b.id = p_bucket and b.user_id = v_user and b."deletedAt" is null) then
    raise exception 'bucket not found' using errcode = '42501';
  end if;
  if not exists (select 1 from public.accounts a
                  where a.id = p_account and a.user_id = v_user and a."deletedAt" is null and not a."isArchived") then
    raise exception 'account not found or archived' using errcode = '42501';
  end if;
  update public.buckets
     set "keptInAccountId" = p_account, "updatedAt" = public.now_ms()
   where id = p_bucket and user_id = v_user and "keptInAccountId" is distinct from p_account;
end;
$$;

-- The Plan B switch amount (Rules card). One value: it is also the Emergency goal's target, so the
-- switch rule and the goal flagged isPlanSwitch change together. 1 centavo .. PHP 10,000,000.00.
create or replace function public.set_plan_switch_target(p_target_minor bigint)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rule uuid;
  v_now bigint := public.now_ms();
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_target_minor is null or p_target_minor < 1 or p_target_minor > 1000000000 then
    raise exception 'target must be above PHP 0 and at most PHP 10,000,000' using errcode = '22023';
  end if;
  select id into v_rule from public.allocation_rules
   where user_id = v_user and kind = 'switch_on_goal' and "deletedAt" is null
   order by "createdAt", id limit 1;
  if v_rule is null then raise exception 'there is no Plan B switch rule to change' using errcode = 'P0002'; end if;
  update public.allocation_rules
     set params = params || jsonb_build_object('targetMinor', p_target_minor), "updatedAt" = v_now
   where id = v_rule;
  update public.goals
     set "targetMinor" = p_target_minor, "updatedAt" = v_now
   where user_id = v_user and "isPlanSwitch" and "deletedAt" is null and "targetMinor" <> p_target_minor;
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('save_plan_lines', 'set_bucket_kept_in', 'set_plan_switch_target')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
