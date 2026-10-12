-- =============================================================================
-- Plans v2 (ticket 26, decision P-9; contract: docs/pm/PLANS_V2.md).
-- Named plans (up to 10), a choice of which plan splits paydays (automatic switch
-- or one plan always), and custom buckets (create / edit / archive / restore).
--
-- Web-only tables (P-5: nothing here touches a mobile-synced table). Every function is SECURITY INVOKER,
-- search_path = public, starts with assert_self(), uses basis points only, soft-deletes, and sets updatedAt to
-- server ms. Refusals the person should read use P0001 (the UI shows the message verbatim); bad input is 22023;
-- ownership is 42501.
--
-- Plans keep their immutable `key`: 'A' / 'B' for the original two, 'p_' + 8 hex for new ones. The key is what
-- allocations."planKey" stores; history looks the name up (soft-deleted plans keep their row).
--
-- Which plan splits paydays is an allocation_rules row of kind 'active_plan':
--   {"mode":"manual","planKey":"..."}  always that plan   |   {"mode":"auto"} or no row: the switch_on_goal rule
--   (fromPlan -> toPlan at the Emergency target; defaults A -> B). The switch rule is kept but ignored while manual.
-- =============================================================================

-- ---------------------------------------------------------------- schema

alter table public.allocation_rules drop constraint if exists allocation_rules_kind_check;
alter table public.allocation_rules
  add constraint allocation_rules_kind_check check (kind in ('switch_on_goal', 'redirect_until_date', 'active_plan'));

-- Existing plans get a name when they have none.
update public.allocation_plans set name = 'Plan ' || key
 where btrim(name) = '' and "deletedAt" is null;

-- ---------------------------------------------------------------- helpers

create or replace function public.plan_money_text(p_minor bigint)
returns text language sql immutable set search_path = public
as $$ select '₱' || to_char(abs(p_minor) / 100.0, 'FM999,999,999,990.00') $$;

-- A plan name: trimmed, 1 to 40 characters, unique among the user's live plans (case-insensitive).
create or replace function public.plan_check_name(p_user uuid, p_name text, p_except uuid default null)
returns text language plpgsql stable security invoker set search_path = public
as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Give the plan a name of 1 to 40 characters.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.allocation_plans p
              where p.user_id = p_user and p."deletedAt" is null and lower(btrim(p.name)) = lower(v_name)
                and p.id is distinct from p_except) then
    raise exception 'You already have a plan called "%". Pick a different name.', v_name using errcode = 'P0001';
  end if;
  return v_name;
end;
$$;

-- Validates a plan's lines and returns the total (bp). Buckets must be live, not archived, not planless, yours.
create or replace function public.plan_lines_check(p_user uuid, p_lines jsonb)
returns bigint language plpgsql stable security invoker set search_path = public
as $$
declare
  v_el jsonb;
  v_bucket uuid;
  v_bp int;
  v_total bigint := 0;
  v_ids uuid[] := array[]::uuid[];
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a json array' using errcode = '22023';
  end if;
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
                    where b.id = v_bucket and b.user_id = p_user and b."deletedAt" is null
                      and not b."isArchived" and not b.planless) then
      raise exception 'bucket % is not one of your plan buckets', v_bucket using errcode = '42501';
    end if;
    v_ids := v_ids || v_bucket;
    v_total := v_total + v_bp;
  end loop;
  return v_total;
end;
$$;

-- Writes already-validated lines: update what exists, insert the rest, soft-delete lines no longer in the plan.
create or replace function public.plan_lines_write(p_user uuid, p_plan uuid, p_lines jsonb)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_el jsonb;
  v_bucket uuid;
  v_bp int;
  v_ids uuid[] := array[]::uuid[];
  v_now bigint := public.now_ms();
begin
  for v_el in select * from jsonb_array_elements(p_lines) loop
    v_bucket := (v_el ->> 'bucketId')::uuid;
    v_bp := (v_el ->> 'percentBp')::int;
    v_ids := v_ids || v_bucket;
    update public.allocation_plan_lines
       set "percentBp" = v_bp, "updatedAt" = v_now
     where user_id = p_user and "planId" = p_plan and "bucketId" = v_bucket and "deletedAt" is null
       and "percentBp" <> v_bp;
    if not exists (select 1 from public.allocation_plan_lines
                    where user_id = p_user and "planId" = p_plan and "bucketId" = v_bucket and "deletedAt" is null) then
      insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp", "createdAt", "updatedAt")
      values (p_user, p_plan, v_bucket, v_bp, v_now, v_now);
    end if;
  end loop;
  update public.allocation_plan_lines
     set "deletedAt" = v_now, "updatedAt" = v_now
   where user_id = p_user and "planId" = p_plan and "deletedAt" is null and not ("bucketId" = any (v_ids));
end;
$$;

create or replace function public.plan_lock(p_user uuid)
returns void language sql volatile security invoker set search_path = public
as $$ select pg_advisory_xact_lock(hashtextextended('salin:plan:' || p_user::text, 0)) $$;

-- ---------------------------------------------------------------- save_plan_lines (any live key)

-- Same contract as before; now shares the validation with create_plan and names the plan in the refusal.
create or replace function public.save_plan_lines(p_plan_key text, p_lines jsonb)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan uuid;
  v_name text;
  v_total bigint;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a json array' using errcode = '22023';
  end if;
  select id, name into v_plan, v_name from public.allocation_plans
   where user_id = v_user and key = p_plan_key and "deletedAt" is null;
  if v_plan is null then raise exception 'plan % not found', p_plan_key using errcode = 'P0002'; end if;
  v_total := public.plan_lines_check(v_user, p_lines);
  if v_total <> 10000 then
    raise exception '% adds up to % percent. It must add up to 100 to be saved.', coalesce(nullif(btrim(v_name), ''), p_plan_key), trim_scale((v_total / 100.0)::numeric(6,2))
      using errcode = '22023';
  end if;
  perform public.plan_lines_write(v_user, v_plan, p_lines);
end;
$$;

-- ---------------------------------------------------------------- create / rename / delete plan

create or replace function public.create_plan(p_name text, p_lines jsonb, p_copy_from text default null)
returns text language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_lines jsonb := p_lines;
  v_src uuid;
  v_total bigint;
  v_key text;
  v_id uuid;
  v_now bigint := public.now_ms();
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform public.plan_lock(v_user);
  v_name := public.plan_check_name(v_user, p_name);
  if (select count(*) from public.allocation_plans p where p.user_id = v_user and p."deletedAt" is null) >= 10 then
    raise exception 'You can have up to 10 plans. Delete one to make room.' using errcode = 'P0001';
  end if;

  if v_lines is null then
    if p_copy_from is null then
      raise exception 'give the plan''s lines, or a plan to copy' using errcode = '22023';
    end if;
    select p.id into v_src from public.allocation_plans p
     where p.user_id = v_user and p.key = p_copy_from and p."deletedAt" is null;
    if v_src is null then raise exception 'plan not found' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('bucketId', l."bucketId", 'percentBp', l."percentBp") order by l.id), '[]'::jsonb)
      into v_lines
      from public.allocation_plan_lines l
      join public.buckets b on b.id = l."bucketId" and b.user_id = v_user and not b."isArchived" and b."deletedAt" is null
     where l."planId" = v_src and l.user_id = v_user and l."deletedAt" is null and l."percentBp" > 0;
  end if;

  v_total := public.plan_lines_check(v_user, v_lines);
  if v_total <> 10000 then
    raise exception '% adds up to % percent. It must add up to 100 to be saved.', v_name, trim_scale((v_total / 100.0)::numeric(6,2))
      using errcode = '22023';
  end if;

  loop
    v_key := 'p_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    exit when not exists (select 1 from public.allocation_plans p where p.user_id = v_user and p.key = v_key);
  end loop;
  insert into public.allocation_plans (user_id, key, name, "createdAt", "updatedAt")
  values (v_user, v_key, v_name, v_now, v_now)
  returning id into v_id;
  perform public.plan_lines_write(v_user, v_id, v_lines);
  return v_key;
end;
$$;

create or replace function public.rename_plan(p_plan_key text, p_name text)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan uuid;
  v_name text;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform public.plan_lock(v_user);
  select p.id into v_plan from public.allocation_plans p
   where p.user_id = v_user and p.key = p_plan_key and p."deletedAt" is null;
  if v_plan is null then raise exception 'plan not found' using errcode = '42501'; end if;
  v_name := public.plan_check_name(v_user, p_name, v_plan);
  update public.allocation_plans set name = v_name, "updatedAt" = public.now_ms()
   where id = v_plan and name is distinct from v_name;
end;
$$;

create or replace function public.delete_plan(p_plan_key text)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan uuid;
  v_name text;
  v_sw record;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform public.plan_lock(v_user);
  select p.id, p.name into v_plan, v_name from public.allocation_plans p
   where p.user_id = v_user and p.key = p_plan_key and p."deletedAt" is null;
  if v_plan is null then raise exception 'plan not found' using errcode = '42501'; end if;

  if (select count(*) from public.allocation_plans p where p.user_id = v_user and p."deletedAt" is null) <= 1 then
    raise exception 'You need at least one plan, so "%" can''t be deleted.', v_name using errcode = 'P0001';
  end if;
  if exists (select 1 from public.allocation_rules r
              where r.user_id = v_user and r.kind = 'active_plan' and r."deletedAt" is null
                and r.params ->> 'mode' = 'manual' and r.params ->> 'planKey' = p_plan_key) then
    raise exception '"%" is the plan splitting your paydays. Choose another plan under "Which plan splits your paydays" first.', v_name using errcode = 'P0001';
  end if;
  select r.params ->> 'fromPlan' as from_plan, r.params ->> 'toPlan' as to_plan into v_sw
    from public.allocation_rules r
   where r.user_id = v_user and r.kind = 'switch_on_goal' and r."deletedAt" is null
   order by r."createdAt", r.id limit 1;
  if found and (coalesce(v_sw.from_plan, 'A') = p_plan_key or coalesce(v_sw.to_plan, 'B') = p_plan_key) then
    raise exception '"%" is one of the two plans your automatic switch uses. Change the switch plans first.', v_name using errcode = 'P0001';
  end if;
  if public.active_plan(v_user) = p_plan_key then
    raise exception '"%" is the plan splitting your paydays. Choose another plan under "Which plan splits your paydays" first.', v_name using errcode = 'P0001';
  end if;

  update public.allocation_plans set "deletedAt" = public.now_ms(), "updatedAt" = public.now_ms() where id = v_plan;
end;
$$;

-- ---------------------------------------------------------------- active plan

-- THE rule for which plan splits a payday, evaluated at confirm time. Manual: that plan. Auto (or no row):
-- today's switch logic with the configured from/to (default A -> B). The result is always a live plan key.
create or replace function public.active_plan(p_user uuid default auth.uid())
returns text language plpgsql stable security invoker set search_path = public
as $$
declare
  r record;
  v_manual text;
  v_bucket uuid;
  v_key text;
begin
  perform public.assert_self(p_user);

  select r2.params ->> 'planKey' into v_manual
    from public.allocation_rules r2
   where r2.user_id = p_user and r2.kind = 'active_plan' and r2."deletedAt" is null and r2.params ->> 'mode' = 'manual'
   order by r2."createdAt", r2.id limit 1;
  if v_manual is not null and exists (select 1 from public.allocation_plans p
                                       where p.user_id = p_user and p.key = v_manual and p."deletedAt" is null) then
    return v_manual;
  end if;

  select coalesce(r2.params ->> 'fromPlan', 'A') as from_plan,
         coalesce(r2.params ->> 'toPlan', 'B') as to_plan,
         (r2.params ->> 'bucketId')::uuid as bucket_id,
         (r2.params ->> 'targetMinor')::bigint as target
    into r
    from public.allocation_rules r2
   where r2.user_id = p_user and r2.kind = 'switch_on_goal' and r2."deletedAt" is null
   order by r2."createdAt", r2.id limit 1;

  if not found then
    v_key := 'A';
  elsif r.target is null then
    v_key := r.from_plan;
  else
    v_bucket := coalesce(r.bucket_id, public.engine_emergency_bucket(p_user));
    v_key := case when v_bucket is not null and public.engine_plan_measure(p_user, v_bucket) >= r.target
                  then r.to_plan else r.from_plan end;
  end if;

  -- never hand back a key that is not a live plan (e.g. Plan A was deleted and there is no switch rule)
  if not exists (select 1 from public.allocation_plans p where p.user_id = p_user and p.key = v_key and p."deletedAt" is null) then
    select p.key into v_key from public.allocation_plans p
     where p.user_id = p_user and p."deletedAt" is null order by p."createdAt", p.key limit 1;
  end if;
  return coalesce(v_key, 'A');
end;
$$;

create or replace function public.set_active_plan(p_mode text, p_plan_key text default null, p_from text default null, p_to text default null)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now bigint := public.now_ms();
  v_rule uuid;
  v_sw uuid;
  v_cur_from text;
  v_cur_to text;
  v_from text;
  v_to text;
  v_em uuid;
  v_target bigint;
  v_params jsonb;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_mode is null or p_mode not in ('manual', 'auto') then
    raise exception 'mode must be manual or auto' using errcode = '22023';
  end if;
  perform public.plan_lock(v_user);

  select r.id into v_rule from public.allocation_rules r
   where r.user_id = v_user and r.kind = 'active_plan' and r."deletedAt" is null order by r."createdAt", r.id limit 1;

  if p_mode = 'manual' then
    if p_plan_key is null then raise exception 'pick the plan to always use' using errcode = '22023'; end if;
    if not exists (select 1 from public.allocation_plans p where p.user_id = v_user and p.key = p_plan_key and p."deletedAt" is null) then
      raise exception 'plan not found' using errcode = '42501';
    end if;
    v_params := jsonb_build_object('mode', 'manual', 'planKey', p_plan_key);
    if v_rule is null then
      insert into public.allocation_rules (user_id, kind, params, "createdAt", "updatedAt") values (v_user, 'active_plan', v_params, v_now, v_now);
    else
      update public.allocation_rules set params = v_params, "updatedAt" = v_now where id = v_rule;
    end if;
    return;
  end if;

  -- auto
  select r.id, r.params ->> 'fromPlan', r.params ->> 'toPlan' into v_sw, v_cur_from, v_cur_to
    from public.allocation_rules r
   where r.user_id = v_user and r.kind = 'switch_on_goal' and r."deletedAt" is null order by r."createdAt", r.id limit 1;

  if p_from is not null or p_to is not null then
    v_from := coalesce(p_from, v_cur_from, 'A');
    v_to := coalesce(p_to, v_cur_to, 'B');
    if v_from = v_to then
      raise exception 'Pick two different plans to switch between.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.allocation_plans p where p.user_id = v_user and p.key = v_from and p."deletedAt" is null)
       or not exists (select 1 from public.allocation_plans p where p.user_id = v_user and p.key = v_to and p."deletedAt" is null) then
      raise exception 'plan not found' using errcode = '42501';
    end if;
    if v_sw is not null then
      update public.allocation_rules
         set params = params || jsonb_build_object('fromPlan', v_from, 'toPlan', v_to), "updatedAt" = v_now
       where id = v_sw;
    else
      v_em := public.engine_emergency_bucket(v_user);
      select g."targetMinor" into v_target from public.goals g
       where g.user_id = v_user and g."isPlanSwitch" and g."deletedAt" is null order by g."createdAt", g.id limit 1;
      v_params := jsonb_build_object('fromPlan', v_from, 'toPlan', v_to);
      if v_em is not null then v_params := v_params || jsonb_build_object('bucketId', v_em); end if;
      if v_target is not null then v_params := v_params || jsonb_build_object('targetMinor', v_target); end if;
      insert into public.allocation_rules (user_id, kind, params, "createdAt", "updatedAt") values (v_user, 'switch_on_goal', v_params, v_now, v_now);
    end if;
  end if;

  if v_rule is not null then
    update public.allocation_rules set params = jsonb_build_object('mode', 'auto'), "updatedAt" = v_now where id = v_rule;
  end if;
end;
$$;

create or replace function public.plan_settings()
returns jsonb language plpgsql stable security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_mode text := 'auto';
  v_manual text;
  v_active text;
  v_sw record;
  v_from text;
  v_to text;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select r.params ->> 'planKey' into v_manual from public.allocation_rules r
   where r.user_id = v_user and r.kind = 'active_plan' and r."deletedAt" is null and r.params ->> 'mode' = 'manual'
   order by r."createdAt", r.id limit 1;
  if v_manual is not null and exists (select 1 from public.allocation_plans p where p.user_id = v_user and p.key = v_manual and p."deletedAt" is null) then
    v_mode := 'manual';
  end if;

  select r.params ->> 'fromPlan' as from_plan, r.params ->> 'toPlan' as to_plan, (r.params ->> 'targetMinor')::bigint as target
    into v_sw from public.allocation_rules r
   where r.user_id = v_user and r.kind = 'switch_on_goal' and r."deletedAt" is null order by r."createdAt", r.id limit 1;
  v_from := coalesce(v_sw.from_plan, 'A');
  v_to := coalesce(v_sw.to_plan, 'B');
  if not exists (select 1 from public.allocation_plans p where p.user_id = v_user and p.key = v_from and p."deletedAt" is null) then v_from := null; end if;
  if not exists (select 1 from public.allocation_plans p where p.user_id = v_user and p.key = v_to and p."deletedAt" is null) then v_to := null; end if;

  v_active := public.active_plan(v_user);
  return jsonb_build_object(
    'mode', v_mode,
    'activeKey', v_active,
    'autoFrom', v_from,
    'autoTo', v_to,
    'targetMinor', v_sw.target,
    'emergencyBucketId', public.engine_emergency_bucket(v_user),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', p.key, 'name', p.name,
               'totalBp', coalesce((select sum(l."percentBp") from public.allocation_plan_lines l
                                     where l."planId" = p.id and l.user_id = v_user and l."deletedAt" is null), 0)::int,
               'isActive', p.key = v_active) order by p."createdAt", p.key)
        from public.allocation_plans p where p.user_id = v_user and p."deletedAt" is null), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- buckets

create or replace function public.bucket_check_name(p_user uuid, p_name text, p_except uuid default null)
returns text language plpgsql stable security invoker set search_path = public
as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Give the bucket a name of 1 to 40 characters.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.buckets b
              where b.user_id = p_user and b."deletedAt" is null and not b."isArchived"
                and lower(btrim(b.name)) = lower(v_name) and b.id is distinct from p_except) then
    raise exception 'You already have a bucket called "%". Pick a different name.', v_name using errcode = 'P0001';
  end if;
  return v_name;
end;
$$;

create or replace function public.bucket_check_room(p_user uuid)
returns void language plpgsql stable security invoker set search_path = public
as $$
begin
  if (select count(*) from public.buckets b
       where b.user_id = p_user and b."deletedAt" is null and not b."isArchived" and not b.planless) >= 20 then
    raise exception 'You can have up to 20 buckets. Archive one to make room.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.create_bucket(p_name text, p_group text, p_hue text default null, p_kept_in text default null)
returns uuid language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_hue text := p_hue;
  v_id uuid;
  v_order bigint;
  v_now bigint := public.now_ms();
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform public.plan_lock(v_user);
  if p_group is null or p_group not in ('spend', 'save', 'set_aside') then
    raise exception 'group must be spend, save or set_aside' using errcode = '22023';
  end if;
  if v_hue is not null and v_hue !~ '^c[1-8]$' then
    raise exception 'colour must be one of c1 to c8' using errcode = '22023';
  end if;
  if p_kept_in is not null and not exists (select 1 from public.accounts a
        where a.id = p_kept_in and a.user_id = v_user and a."deletedAt" is null and not a."isArchived") then
    raise exception 'account not found or archived' using errcode = '42501';
  end if;
  v_name := public.bucket_check_name(v_user, p_name);
  perform public.bucket_check_room(v_user);

  if v_hue is null then
    -- the least-used palette colour among the user's live buckets (ties: lowest)
    select x.c into v_hue from (
      select 'c' || g as c,
             (select count(*) from public.buckets b where b.user_id = v_user and b."deletedAt" is null and b.hue = 'c' || g) as n, g
        from generate_series(1, 8) g) x
     order by x.n, x.g limit 1;
  end if;

  select coalesce(max(b."displayOrder"), 0) + 1 into v_order from public.buckets b where b.user_id = v_user;
  insert into public.buckets (user_id, name, "groupKey", hue, "keptInAccountId", planless, "displayOrder", "createdAt", "updatedAt")
  values (v_user, v_name, p_group, v_hue, p_kept_in, false, v_order, v_now, v_now)
  returning id into v_id;
  return v_id;
end;
$$;

-- Edit any bucket. A built-in's colour (its identity: emergency, rent, living ...) can't change; a custom
-- bucket's colour is one of c1..c8. A null p_hue leaves the colour as it is.
create or replace function public.update_bucket(p_bucket uuid, p_name text, p_short_name text, p_group text, p_hue text)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_b public.buckets;
  v_name text;
  v_short text := nullif(btrim(coalesce(p_short_name, '')), '');
  v_hue text;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform public.plan_lock(v_user);
  select * into v_b from public.buckets b where b.id = p_bucket and b.user_id = v_user and b."deletedAt" is null;
  if not found then raise exception 'bucket not found' using errcode = '42501'; end if;
  if p_group is null or p_group not in ('spend', 'save', 'set_aside') then
    raise exception 'group must be spend, save or set_aside' using errcode = '22023';
  end if;
  if v_short is not null and char_length(v_short) > 20 then
    raise exception 'The short name can be up to 20 characters.' using errcode = 'P0001';
  end if;
  v_name := public.bucket_check_name(v_user, p_name, case when v_b."isArchived" then null else p_bucket end);

  v_hue := coalesce(p_hue, v_b.hue);
  if v_hue is distinct from v_b.hue then
    if v_b.hue is not null and v_b.hue !~ '^c[1-8]$' then
      raise exception 'The colour of "%" can''t be changed: Salin uses it to recognise this bucket.', v_b.name using errcode = 'P0001';
    end if;
    if v_hue !~ '^c[1-8]$' then
      raise exception 'colour must be one of c1 to c8' using errcode = '22023';
    end if;
  end if;

  update public.buckets
     set name = v_name, "shortName" = v_short, "groupKey" = p_group, hue = v_hue, "updatedAt" = public.now_ms()
   where id = p_bucket and user_id = v_user;
end;
$$;

-- Why a bucket can't be archived yet, in plain language; null when it can.
create or replace function public.bucket_archive_reason(p_bucket uuid)
returns text language plpgsql stable security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_b public.buckets;
  v_txt text;
  v_n int;
  v_left bigint;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_b from public.buckets b where b.id = p_bucket and b.user_id = v_user and b."deletedAt" is null;
  if not found then raise exception 'bucket not found' using errcode = '42501'; end if;
  if v_b."isArchived" then return 'It is already archived.'; end if;

  if public.engine_emergency_bucket(v_user) = p_bucket then
    return 'Emergency can''t be archived: rounding and Plan B depend on it.';
  end if;

  select string_agg(p.name, ', ' order by p."createdAt", p.key) into v_txt
    from public.allocation_plans p
   where p.user_id = v_user and p."deletedAt" is null
     and exists (select 1 from public.allocation_plan_lines l
                  where l."planId" = p.id and l."bucketId" = p_bucket and l."deletedAt" is null and l."percentBp" > 0);
  if v_txt is not null then
    return format('It still gets a share in %s. Set it to 0%% in every plan first.', v_txt);
  end if;

  select count(*) into v_n from public.category_buckets cb
   where cb.user_id = v_user and cb."bucketId" = p_bucket and cb."deletedAt" is null;
  if v_n > 0 then
    return format('%s %s mapped to it. Move %s to another bucket first.', v_n,
                  case when v_n = 1 then 'category is' else 'categories are' end, case when v_n = 1 then 'it' else 'them' end);
  end if;

  select s.name into v_txt from public.income_sources s
   where s.user_id = v_user and s."deletedAt" is null and s."wholeBucketId" = p_bucket
   order by s."createdAt", s.id limit 1;
  if v_txt is not null then
    return format('The income source "%s" keeps its money whole in it. Change that first.', v_txt);
  end if;
  select s.name into v_txt from public.income_sources s
    join public.income_source_split_lines l on l."sourceId" = s.id and l.user_id = v_user and l."deletedAt" is null
   where s.user_id = v_user and s."deletedAt" is null and l."bucketId" = p_bucket and l."percentBp" > 0
   order by s."createdAt", s.id limit 1;
  if v_txt is not null then
    return format('The income source "%s" splits part of its pay into it. Change that first.', v_txt);
  end if;

  select coalesce(sum(l.left_minor), 0)::bigint into v_left from public.engine_bucket_left(v_user) l where l.bucket_id = p_bucket;
  if v_left > 0 then
    return format('It still has %s in it. Move it to another bucket first.', public.plan_money_text(v_left));
  elsif v_left < 0 then
    return format('It is overspent by %s. Cover it first.', public.plan_money_text(v_left));
  end if;
  return null;
end;
$$;

create or replace function public.archive_bucket(p_bucket uuid)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reason text;
  v_archived boolean;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform public.plan_lock(v_user);
  select b."isArchived" into v_archived from public.buckets b where b.id = p_bucket and b.user_id = v_user and b."deletedAt" is null;
  if not found then raise exception 'bucket not found' using errcode = '42501'; end if;
  if v_archived then return; end if;
  v_reason := public.bucket_archive_reason(p_bucket);
  if v_reason is not null then raise exception '%', v_reason using errcode = 'P0001'; end if;
  update public.buckets set "isArchived" = true, "updatedAt" = public.now_ms() where id = p_bucket and user_id = v_user;
end;
$$;

-- Back at 0% in every plan (archiving required it, and plans can't hold an archived bucket).
create or replace function public.restore_bucket(p_bucket uuid)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_b public.buckets;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform public.plan_lock(v_user);
  select * into v_b from public.buckets b where b.id = p_bucket and b.user_id = v_user and b."deletedAt" is null;
  if not found then raise exception 'bucket not found' using errcode = '42501'; end if;
  if not v_b."isArchived" then return; end if;
  perform public.bucket_check_name(v_user, v_b.name, p_bucket);
  if not v_b.planless then perform public.bucket_check_room(v_user); end if;
  update public.allocation_plan_lines set "deletedAt" = public.now_ms(), "updatedAt" = public.now_ms()
   where user_id = v_user and "bucketId" = p_bucket and "deletedAt" is null;
  update public.buckets set "isArchived" = false, "updatedAt" = public.now_ms() where id = p_bucket and user_id = v_user;
end;
$$;

-- ---------------------------------------------------------------- nudge_plan_percent (D-18, P-9 decision 9)

-- "Move 1% from Fun to Living": moves p_bp basis points from one bucket to another in EVERY live plan where the
-- giving bucket has at least p_bp (the others are left alone). Refuses, changing nothing, when no plan qualifies.
-- Each changed plan keeps totalling 10000 bp. Future paydays only. Returns each changed plan's new percentages.
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
  v_keys text[] := array[]::text[];
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_bp is null or p_bp < 1 or p_bp > 10000 then raise exception 'the amount to move must be between 0.01 and 100 percent' using errcode = '22023'; end if;
  if p_from_bucket is null or p_to_bucket is null or p_from_bucket = p_to_bucket then
    raise exception 'pick two different buckets' using errcode = '22023';
  end if;
  perform public.plan_lock(v_user);

  select b.name into v_from_name from public.buckets b
   where b.id = p_from_bucket and b.user_id = v_user and b."deletedAt" is null and not b."isArchived" and not b.planless;
  if v_from_name is null then raise exception 'bucket % is not one of your plan buckets', p_from_bucket using errcode = '42501'; end if;
  select b.name into v_to_name from public.buckets b
   where b.id = p_to_bucket and b.user_id = v_user and b."deletedAt" is null and not b."isArchived" and not b.planless;
  if v_to_name is null then raise exception 'bucket % is not one of your plan buckets', p_to_bucket using errcode = '42501'; end if;

  if not exists (select 1 from public.allocation_plans p where p.user_id = v_user and p."deletedAt" is null) then
    raise exception 'there is no plan to change' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(p.key order by p."createdAt", p.key), array[]::text[]) into v_keys
    from public.allocation_plans p
   where p.user_id = v_user and p."deletedAt" is null
     and coalesce((select l."percentBp" from public.allocation_plan_lines l
                    where l."planId" = p.id and l."bucketId" = p_from_bucket and l."deletedAt" is null limit 1), 0) >= p_bp;
  if coalesce(array_length(v_keys, 1), 0) = 0 then
    raise exception '%', format('%s has less than %s%% in every plan, so %s%% can''t move to %s. Change the split in Plans instead.',
      v_from_name, trim_scale((p_bp / 100.0)::numeric(6,2)), trim_scale((p_bp / 100.0)::numeric(6,2)), v_to_name)
      using errcode = '22023';
  end if;

  for r in select p.id, p.key, p.name from public.allocation_plans p
            where p.user_id = v_user and p."deletedAt" is null and p.key = any (v_keys) order by p."createdAt", p.key loop
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
      -- A plan that didn't total 100 before is not something to nudge; the whole call rolls back.
      raise exception '% does not add up to 100 percent. Fix it in Plans first.', r.name using errcode = '22023';
    end if;
  end loop;

  return query
    select p.key,
           coalesce((select l."percentBp" from public.allocation_plan_lines l where l."planId" = p.id and l."bucketId" = p_from_bucket and l."deletedAt" is null limit 1), 0),
           coalesce((select l."percentBp" from public.allocation_plan_lines l where l."planId" = p.id and l."bucketId" = p_to_bucket and l."deletedAt" is null limit 1), 0)
      from public.allocation_plans p
     where p.user_id = v_user and p."deletedAt" is null and p.key = any (v_keys) order by p."createdAt", p.key;
end;
$$;

-- ---------------------------------------------------------------- privileges
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('plan_money_text', 'plan_check_name', 'plan_lines_check', 'plan_lines_write', 'plan_lock',
                         'save_plan_lines', 'create_plan', 'rename_plan', 'delete_plan', 'active_plan', 'set_active_plan',
                         'plan_settings', 'bucket_check_name', 'bucket_check_room', 'create_bucket', 'update_bucket',
                         'bucket_archive_reason', 'archive_bucket', 'restore_bucket', 'nudge_plan_percent')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
