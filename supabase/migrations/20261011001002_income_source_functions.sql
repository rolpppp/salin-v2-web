-- =============================================================================
-- Plans -> Income sources (SPEC 4.2, BR 2.1, ROADMAP ticket 9).
--
-- SECURITY INVOKER, search_path = public, assert_self() first, basis points only, updatedAt set to
-- server ms, soft delete only. None of them touches `allocations` (immutable history): a rule change
-- applies to money that has not been given a job yet.
-- =============================================================================

-- Owned, live source or an error. Cross-user ids give the same error as unknown ids.
create or replace function public.engine_own_source(p_user uuid, p_source uuid)
returns public.income_sources language plpgsql stable security invoker set search_path = public
as $$
declare s public.income_sources;
begin
  select * into s from public.income_sources where id = p_source and user_id = p_user and "deletedAt" is null;
  if s.id is null then raise exception 'income source not found' using errcode = 'P0002'; end if;
  return s;
end;
$$;

-- A bucket a source may point at: yours, live, not archived, and never the Rent bucket (BR 2.5, SPEC 4.2).
create or replace function public.engine_assert_source_bucket(p_user uuid, p_bucket uuid)
returns void language plpgsql stable security invoker set search_path = public
as $$
begin
  if not exists (select 1 from public.buckets b
                  where b.id = p_bucket and b.user_id = p_user and b."deletedAt" is null and not b."isArchived") then
    raise exception 'bucket % is not one of your buckets', p_bucket using errcode = '42501';
  end if;
  if p_bucket is not distinct from public.engine_rent_bucket(p_user) then
    raise exception 'Rent cannot be used for an income source' using errcode = '22023';
  end if;
end;
$$;

-- + Add income source -> a preset kind with its default rule (SPEC 4.2). Also creates (or reuses an
-- unused income category of the same name) so mobile entries can be tagged with it.
--   salary -> plan | scholarship -> whole, the planless bucket | side_hustle -> own Tax 10 / Sinking 40 / Fun 50
--   allowance -> whole Living | gift, refund, other -> ask
-- If a bucket a default needs is missing, the source starts as "ask" rather than half-configured.
create or replace function public.add_income_source(p_kind text, p_name text default null)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now bigint := public.now_ms();
  v_label text;
  v_name text;
  v_base text;
  v_n int := 1;
  v_rule text := 'ask';
  v_whole uuid;
  v_cat text;
  v_src uuid;
  v_tax uuid; v_sink uuid; v_fun uuid;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  v_label := case p_kind when 'salary' then 'Salary' when 'scholarship' then 'Scholarship' when 'side_hustle' then 'Side hustle'
                         when 'allowance' then 'Allowance' when 'gift' then 'Gift' when 'refund' then 'Refund' when 'other' then 'Other' end;
  if v_label is null then raise exception 'unknown income kind %', p_kind using errcode = '22023'; end if;
  v_base := btrim(coalesce(nullif(btrim(p_name), ''), v_label));
  if char_length(v_base) > 60 then raise exception 'name must be 1 to 60 characters' using errcode = '22023'; end if;

  -- unique among live sources: "Side hustle", "Side hustle 2", ...
  v_name := v_base;
  while exists (select 1 from public.income_sources s where s.user_id = v_user and s."deletedAt" is null and lower(s.name) = lower(v_name)) loop
    v_n := v_n + 1;
    v_name := left(v_base, 56) || ' ' || v_n;
  end loop;

  select b.id into v_tax from public.buckets b where b.user_id = v_user and b."deletedAt" is null and not b."isArchived" and b.hue = 'tax' order by b."displayOrder", b.id limit 1;
  select b.id into v_sink from public.buckets b where b.user_id = v_user and b."deletedAt" is null and not b."isArchived" and b.hue = 'sinking' order by b."displayOrder", b.id limit 1;
  select b.id into v_fun from public.buckets b where b.user_id = v_user and b."deletedAt" is null and not b."isArchived" and b.hue = 'fun' order by b."displayOrder", b.id limit 1;

  if p_kind = 'salary' then
    v_rule := 'plan';
  elsif p_kind = 'scholarship' then
    select b.id into v_whole from public.buckets b
     where b.user_id = v_user and b."deletedAt" is null and not b."isArchived" and (b.planless or b.hue = 'dost')
     order by b.planless desc, b."displayOrder", b.id limit 1;
    if v_whole is not null then v_rule := 'whole'; end if;
  elsif p_kind = 'allowance' then
    select b.id into v_whole from public.buckets b
     where b.user_id = v_user and b."deletedAt" is null and not b."isArchived" and b.hue = 'living'
     order by b."displayOrder", b.id limit 1;
    if v_whole is not null then v_rule := 'whole'; end if;
  elsif p_kind = 'side_hustle' then
    if v_tax is not null and v_sink is not null and v_fun is not null then v_rule := 'own'; end if;
  end if;

  -- income category (mobile table categories, categoryType 0 = income)
  select c.id into v_cat from public.categories c
   where c.user_id = v_user and c."deletedAt" is null and c."categoryType" = 0 and lower(c.name) = lower(v_name)
     and not exists (select 1 from public.income_sources s where s.user_id = v_user and s."deletedAt" is null and s."categoryId" = c.id)
   order by c."displayOrder", c.id limit 1;
  if v_cat is null then
    v_cat := gen_random_uuid()::text;
    insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "syncStatus")
    values (v_cat, v_user, v_name, 'category', '#2E6EA6', 0, false,
            coalesce((select max(c2."displayOrder") + 1 from public.categories c2 where c2.user_id = v_user), 0), v_now, v_now, 2);
  end if;

  insert into public.income_sources (user_id, name, kind, rule, "wholeBucketId", "categoryId", "createdAt", "updatedAt")
  values (v_user, v_name, p_kind, v_rule, case when v_rule = 'whole' then v_whole end, v_cat, v_now, v_now)
  returning id into v_src;

  if v_rule = 'own' then
    insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp", "createdAt", "updatedAt") values
      (v_user, v_src, v_tax, 1000, v_now, v_now),
      (v_user, v_src, v_sink, 4000, v_now, v_now),
      (v_user, v_src, v_fun, 5000, v_now, v_now);
  end if;
  return v_src;
end;
$$;

-- Rename. Only while the source has no income (a name is what the person sees on past paydays).
create or replace function public.rename_income_source(p_source uuid, p_name text)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now bigint := public.now_ms();
  v_name text := btrim(coalesce(p_name, ''));
  s public.income_sources;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  s := public.engine_own_source(v_user, p_source);
  if char_length(v_name) not between 1 and 60 then raise exception 'name must be 1 to 60 characters' using errcode = '22023'; end if;
  if exists (select 1 from public.income_meta m where m.user_id = v_user and m."sourceId" = s.id) then
    raise exception 'a source that already has income keeps its name' using errcode = '55000';
  end if;
  if exists (select 1 from public.income_sources o where o.user_id = v_user and o."deletedAt" is null and o.id <> s.id and lower(o.name) = lower(v_name)) then
    raise exception 'you already have an income source called %', v_name using errcode = '23505';
  end if;
  update public.income_sources set name = v_name, "updatedAt" = v_now where id = s.id;
  update public.categories set name = v_name, "updatedAt" = v_now
   where user_id = v_user and id = s."categoryId" and "categoryType" = 0 and "deletedAt" is null and name <> v_name;
end;
$$;

-- The rule. 'whole' needs a bucket (never Rent); any other rule clears it. The own split lines are kept,
-- so switching back to "own" restores them.
create or replace function public.set_income_source_rule(p_source uuid, p_rule text, p_whole_bucket uuid default null)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  s public.income_sources;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  s := public.engine_own_source(v_user, p_source);
  if p_rule is null or p_rule not in ('plan', 'own', 'whole', 'ask') then
    raise exception 'unknown rule %', p_rule using errcode = '22023';
  end if;
  if p_rule = 'whole' then
    if p_whole_bucket is null then raise exception 'choose a bucket to keep it whole in' using errcode = '22023'; end if;
    perform public.engine_assert_source_bucket(v_user, p_whole_bucket);
  end if;
  update public.income_sources
     set rule = p_rule,
         "wholeBucketId" = case when p_rule = 'whole' then p_whole_bucket end,
         "updatedAt" = public.now_ms()
   where id = s.id and (rule <> p_rule or "wholeBucketId" is distinct from (case when p_rule = 'whole' then p_whole_bucket end));
end;
$$;

-- The own split. Replaces the lines; 0 means skipped (no line). Any total is saved, because an incomplete
-- split is unusable rather than rescaled (BR 2.1.4); only > 100% is refused.
create or replace function public.save_income_source_split(p_source uuid, p_lines jsonb)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now bigint := public.now_ms();
  v_el jsonb;
  v_bucket uuid;
  v_bp int;
  v_total bigint := 0;
  v_ids uuid[] := array[]::uuid[];
  s public.income_sources;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  s := public.engine_own_source(v_user, p_source);
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
    if v_bp not between 0 and 10000 then raise exception 'percent must be between 0 and 100' using errcode = '22023'; end if;
    if v_bucket = any (v_ids) then raise exception 'a bucket appears twice in the split' using errcode = '22023'; end if;
    perform public.engine_assert_source_bucket(v_user, v_bucket);
    v_ids := v_ids || v_bucket;
    v_total := v_total + v_bp;
  end loop;
  if v_total > 10000 then
    raise exception 'The split adds up to % percent. Take % percent out.', trim_scale((v_total / 100.0)::numeric(6,2)), trim_scale(((v_total - 10000) / 100.0)::numeric(6,2))
      using errcode = '22023';
  end if;

  for v_el in select * from jsonb_array_elements(p_lines) loop
    v_bucket := (v_el ->> 'bucketId')::uuid;
    v_bp := (v_el ->> 'percentBp')::int;
    continue when v_bp = 0;
    update public.income_source_split_lines
       set "percentBp" = v_bp, "updatedAt" = v_now
     where user_id = v_user and "sourceId" = s.id and "bucketId" = v_bucket and "deletedAt" is null and "percentBp" <> v_bp;
    if not exists (select 1 from public.income_source_split_lines
                    where user_id = v_user and "sourceId" = s.id and "bucketId" = v_bucket and "deletedAt" is null) then
      insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp", "createdAt", "updatedAt")
      values (v_user, s.id, v_bucket, v_bp, v_now, v_now);
    end if;
  end loop;
  -- zero or omitted buckets are skipped: soft-delete their lines
  update public.income_source_split_lines l
     set "deletedAt" = v_now, "updatedAt" = v_now
   where l.user_id = v_user and l."sourceId" = s.id and l."deletedAt" is null
     and (not (l."bucketId" = any (v_ids))
          or exists (select 1 from jsonb_array_elements(p_lines) e
                      where (e ->> 'bucketId')::uuid = l."bucketId" and (e ->> 'percentBp')::int = 0));
end;
$$;

-- Where the money usually lands. The account must be yours and live (null clears it).
create or replace function public.set_income_source_lands_in(p_source uuid, p_account text)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  s public.income_sources;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  s := public.engine_own_source(v_user, p_source);
  if p_account is not null and not exists (select 1 from public.accounts a
       where a.id = p_account and a.user_id = v_user and a."deletedAt" is null and not a."isArchived") then
    raise exception 'account not found or archived' using errcode = '42501';
  end if;
  update public.income_sources set "landsInAccountId" = p_account, "updatedAt" = public.now_ms()
   where id = s.id and "landsInAccountId" is distinct from p_account;
end;
$$;

-- Archive (and restore). Archived sources stop matching mobile entries; their history stays.
create or replace function public.set_income_source_archived(p_source uuid, p_archived boolean)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  s public.income_sources;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  s := public.engine_own_source(v_user, p_source);
  if p_archived is null then raise exception 'p_archived is required' using errcode = '22023'; end if;
  update public.income_sources set "isArchived" = p_archived, "updatedAt" = public.now_ms()
   where id = s.id and "isArchived" <> p_archived;
end;
$$;

-- Remove (soft delete) a source that never had income. Otherwise archive it instead. Its income category
-- goes with it unless something still uses it.
create or replace function public.remove_income_source(p_source uuid)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now bigint := public.now_ms();
  s public.income_sources;
begin
  perform public.assert_self(v_user);
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  s := public.engine_own_source(v_user, p_source);
  if exists (select 1 from public.income_meta m where m.user_id = v_user and m."sourceId" = s.id) then
    raise exception 'a source with income cannot be removed, archive it instead' using errcode = '55000';
  end if;
  update public.income_source_split_lines set "deletedAt" = v_now, "updatedAt" = v_now
   where user_id = v_user and "sourceId" = s.id and "deletedAt" is null;
  update public.income_sources set "deletedAt" = v_now, "updatedAt" = v_now where id = s.id;
  if s."categoryId" is not null
     and not exists (select 1 from public.ledger_entries le where le.user_id = v_user and le."categoryId" = s."categoryId" and le."deletedAt" is null)
     and not exists (select 1 from public.income_sources o where o.user_id = v_user and o."deletedAt" is null and o."categoryId" = s."categoryId") then
    update public.categories set "deletedAt" = v_now, "updatedAt" = v_now
     where user_id = v_user and id = s."categoryId" and "categoryType" = 0 and "deletedAt" is null;
  end if;
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('engine_own_source', 'engine_assert_source_bucket', 'add_income_source', 'rename_income_source',
                         'set_income_source_rule', 'save_income_source_split', 'set_income_source_lands_in',
                         'set_income_source_archived', 'remove_income_source')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
