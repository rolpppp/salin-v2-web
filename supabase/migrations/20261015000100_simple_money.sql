-- Simple Money (ticket 28, P-11): a second Today that sits on the same data.
--   user_profiles: viewMode ('simple' | 'full'), spendUntil (date), keepBucketId
--   income_meta.job: gains 'manual' (the user typed the exact amount per account)
--   day_checkins: one row per (user, day, kind), soft deleted; the "no spend today" habit
--   receive_money(): one inflow + its allocations in one transaction
--   allocations unique index widened to include destAccountId (one bucket may land in several accounts)
--   set_view_mode / set_spend_until / set_keep_bucket / set_no_spend: trivial setters
-- Never touches the 12 mobile-synced tables' columns. The inflow row is exactly what Add income writes.

-- ---------------------------------------------------------------- user_profiles

alter table public.user_profiles add column "viewMode" text not null default 'full' check ("viewMode" in ('simple', 'full'));
alter table public.user_profiles add column "spendUntil" date;
alter table public.user_profiles add column "keepBucketId" uuid references public.buckets (id) on delete set null;

-- ---------------------------------------------------------------- income_meta.job

alter table public.income_meta drop constraint if exists income_meta_job_check;
alter table public.income_meta add constraint income_meta_job_check check (job in ('plan', 'own', 'whole', 'one', 'manual'));

-- ---------------------------------------------------------------- allocations: one bucket, several accounts

drop index if exists public.allocations_entry_bucket_active_uq;
create unique index allocations_entry_bucket_dest_active_uq
  on public.allocations (user_id, "ledgerEntryId", "bucketId", coalesce("destAccountId", ''))
  where "deletedAt" is null;

-- ---------------------------------------------------------------- day_checkins

create table public.day_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('no_spend')),
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);
create unique index day_checkins_live_uq on public.day_checkins (user_id, day, kind) where "deletedAt" is null;
create index day_checkins_user_idx on public.day_checkins (user_id);

alter table public.day_checkins enable row level security;
revoke all on public.day_checkins from anon, authenticated;
create policy "day_checkins_select_own" on public.day_checkins for select to authenticated using (user_id = (select auth.uid()));
create policy "day_checkins_insert_own" on public.day_checkins for insert to authenticated with check (user_id = (select auth.uid()));
create policy "day_checkins_update_own" on public.day_checkins for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.day_checkins to authenticated;
create trigger day_checkins_set_updated_at before insert or update on public.day_checkins
  for each row execute function public.set_updated_at_ms();

-- ---------------------------------------------------------------- setters

create or replace function public.set_view_mode(p_mode text)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_mode is null or p_mode not in ('simple', 'full') then
    raise exception 'View must be simple or full' using errcode = '22023';
  end if;
  update public.user_profiles set "viewMode" = p_mode where user_id = v_user and "deletedAt" is null;
  if not found then raise exception 'Finish setting up first.' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.set_spend_until(p_day date)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  update public.user_profiles set "spendUntil" = p_day where user_id = v_user and "deletedAt" is null;
  if not found then raise exception 'Finish setting up first.' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.set_keep_bucket(p_bucket uuid)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_group text;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select b."groupKey" into v_group from public.buckets b
   where b.id = p_bucket and b.user_id = v_user and b."deletedAt" is null and not b."isArchived";
  if not found then raise exception 'That bucket is not yours or is gone' using errcode = '42501'; end if;
  if v_group = 'spend' then
    raise exception 'Pick a bucket you save in, not one you spend from.' using errcode = '22023';
  end if;
  update public.user_profiles set "keepBucketId" = p_bucket where user_id = v_user and "deletedAt" is null;
  if not found then raise exception 'Finish setting up first.' using errcode = 'P0001'; end if;
end;
$$;

-- Marks (or unmarks) a no-spend day. Today or up to 14 days back, never the future (Manila calendar, like the rest).
create or replace function public.set_no_spend(p_day date, p_on boolean)
returns void language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := public.entry_local_date(public.now_ms());
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_day is null or p_on is null then raise exception 'day and on are required' using errcode = '22023'; end if;
  if p_day > v_today then raise exception 'That day has not happened yet.' using errcode = '22023'; end if;
  if p_day < v_today - 14 then raise exception 'You can only change the last 14 days.' using errcode = '22023'; end if;
  if p_on then
    insert into public.day_checkins (user_id, day, kind) values (v_user, p_day, 'no_spend')
    on conflict (user_id, day, kind) where "deletedAt" is null do nothing;
  else
    update public.day_checkins set "deletedAt" = public.now_ms()
     where user_id = v_user and day = p_day and kind = 'no_spend' and "deletedAt" is null;
  end if;
end;
$$;

-- ---------------------------------------------------------------- receive_money

-- p_lines: [{"bucketId": uuid, "destAccountId": text, "amountMinor": bigint}], each > 0, total exactly p_amount.
-- One inflow on p_received_in plus one allocation per (bucket, destination account), in one transaction.
-- Each line's destination is snapshotted, so the existing transfer checklist shows "Move X from A to B"
-- for every line whose destination is not the account the money landed in.
create or replace function public.receive_money(p_amount bigint, p_received_in text, p_source_id uuid, p_name text, p_on date, p_lines jsonb)
returns uuid language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now bigint := public.now_ms();
  v_today date := public.entry_local_date(v_now);
  v_acc record;
  v_src record;
  v_src_id uuid;
  v_cat text;
  v_note text := nullif(btrim(coalesce(p_name, '')), '');
  v_occurred bigint;
  v_entry text := gen_random_uuid()::text;
  v_cycle uuid;
  v_total bigint;
  v_line record;
  v_pending boolean;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above zero.' using errcode = '22023'; end if;
  if v_note is not null and char_length(v_note) > 120 then raise exception 'Keep the name under 120 characters.' using errcode = '22023'; end if;
  if p_on is null then raise exception 'Pick a date.' using errcode = '22023'; end if;
  if p_on > v_today then raise exception 'That date has not happened yet.' using errcode = '22023'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Say where the money goes.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('salin:cycle:' || v_user::text, 0));

  -- received-in account: the caller's own, live, not archived, PHP
  select a.id, a.currency, a."isArchived" into v_acc from public.accounts a
   where a.id = p_received_in and a.user_id = v_user and a."deletedAt" is null;
  if not found then raise exception 'That account is not yours or is gone' using errcode = '42501'; end if;
  if v_acc."isArchived" or v_acc.currency <> 'PHP' then raise exception 'Pick one of your peso accounts.' using errcode = '22023'; end if;

  -- lines: positive amounts, exactly p_amount, own live buckets, own live PHP accounts
  for v_line in
    select x."bucketId", x."destAccountId", x."amountMinor"
      from jsonb_to_recordset(p_lines) as x("bucketId" uuid, "destAccountId" text, "amountMinor" bigint)
  loop
    if v_line."bucketId" is null or v_line."destAccountId" is null or v_line."amountMinor" is null or v_line."amountMinor" <= 0 then
      raise exception 'Every line needs a bucket, an account and an amount above zero.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.buckets b where b.id = v_line."bucketId" and b.user_id = v_user and b."deletedAt" is null) then
      raise exception 'That bucket is not yours or is gone' using errcode = '42501';
    end if;
    if exists (select 1 from public.buckets b where b.id = v_line."bucketId" and b."isArchived") then
      raise exception 'That bucket is archived.' using errcode = '22023';
    end if;
    select a.currency, a."isArchived" into v_acc from public.accounts a
     where a.id = v_line."destAccountId" and a.user_id = v_user and a."deletedAt" is null;
    if not found then raise exception 'That account is not yours or is gone' using errcode = '42501'; end if;
    if v_acc."isArchived" or v_acc.currency <> 'PHP' then raise exception 'Pick one of your peso accounts.' using errcode = '22023'; end if;
  end loop;
  select sum(x."amountMinor") into v_total
    from jsonb_to_recordset(p_lines) as x("bucketId" uuid, "destAccountId" text, "amountMinor" bigint);
  if v_total <> p_amount then
    raise exception 'The amounts add up to % centavos, not the % you received.', v_total, p_amount using errcode = '22023';
  end if;

  -- income source: the one given, else Others (created the first time, as the recognition trigger does)
  if p_source_id is not null then
    select s.id, s.name, s."categoryId" into v_src from public.income_sources s
     where s.id = p_source_id and s.user_id = v_user and s."deletedAt" is null and not s."isArchived";
    if not found then raise exception 'That source is not yours or is gone' using errcode = '42501'; end if;
  else
    select s.id, s.name, s."categoryId" into v_src from public.income_sources s
     where s.user_id = v_user and s.kind = 'other' and s.name = 'Others' and s."deletedAt" is null and not s."isArchived"
     order by s."createdAt", s.id limit 1;
    if not found then
      insert into public.income_sources (user_id, name, kind, rule) values (v_user, 'Others', 'other', 'ask')
      returning id, name, "categoryId" into v_src;
    end if;
  end if;
  v_src_id := v_src.id;
  v_cat := v_src."categoryId";
  if v_cat is null then
    select c.id into v_cat from public.categories c
     where c.user_id = v_user and c."categoryType" = 0 and c.name = v_src.name and c."deletedAt" is null
     order by c."createdAt", c.id limit 1;
    if v_cat is null then
      v_cat := gen_random_uuid()::text;
      insert into public.categories (id, user_id, name, icon, color, "categoryType", "isSystem", "displayOrder", "createdAt", "updatedAt", "deletedAt", "syncStatus")
      values (v_cat, v_user, v_src.name, 'category', '#2E6EA6', 0, false, v_now, v_now, v_now, null, 2);
    end if;
    update public.income_sources set "categoryId" = v_cat where id = v_src_id;
  end if;

  -- today's income lands "now"; an earlier date lands at 12:00 Manila, as Add income does
  v_occurred := case when p_on = v_today then v_now
                     else (extract(epoch from (p_on::timestamp + interval '12 hours') at time zone 'Asia/Manila') * 1000)::bigint end;

  insert into public.ledger_entries (id, user_id, "accountId", "categoryId", "recurringInstanceId", "debtId", "splitId", "transferId",
                                     "amountMinor", direction, origin, "occurredAt", note, "metadataJson", "createdAt", "updatedAt", "deletedAt", "syncStatus")
  values (v_entry, v_user, p_received_in, v_cat, null, null, null, null, p_amount, 0, 0, v_occurred, v_note, null, v_now, v_now, null, 2);

  -- the recognition trigger may have made the meta row already; either way it ends as this source, job 'manual'
  insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job, "createdAt", "updatedAt")
  values (v_user, v_entry, v_src_id, 'manual', v_now, v_now)
  on conflict (user_id, "ledgerEntryId")
  do update set "sourceId" = excluded."sourceId", job = 'manual', "oneBucketId" = null, "deletedAt" = null, "updatedAt" = v_now;

  -- the transfer cycle this money joins: the open one, or a new one (P-3)
  v_cycle := (select id from public.transfer_cycles where user_id = v_user and "closedAt" is null and "deletedAt" is null limit 1);
  if v_cycle is null then
    insert into public.transfer_cycles (user_id) values (v_user) returning id into v_cycle;
  end if;

  for v_line in
    select x."bucketId", x."destAccountId", sum(x."amountMinor")::bigint as amount
      from jsonb_to_recordset(p_lines) as x("bucketId" uuid, "destAccountId" text, "amountMinor" bigint)
     group by x."bucketId", x."destAccountId"
     order by (select b."displayOrder" from public.buckets b where b.id = x."bucketId"), x."bucketId", x."destAccountId"
  loop
    insert into public.allocations (user_id, "ledgerEntryId", "bucketId", "amountMinor", "destAccountId", "planKey",
                                    "percentBp", "ruleTrace", "confirmedAt", "transferCycleId")
    values (v_user, v_entry, v_line."bucketId", v_line.amount, v_line."destAccountId", null, null,
            jsonb_build_object('rule', 'manual', 'job', 'manual', 'sourceId', v_src_id, 'destAccountId', v_line."destAccountId"),
            v_now, v_cycle);
  end loop;

  -- a cycle with nothing left to send (everything stays where it landed) closes right away
  select exists (select 1 from public.engine_transfer_plan(v_user, v_cycle) t where t.kind = 'transfer' and not t.done) into v_pending;
  if not v_pending then
    update public.transfer_cycles set "closedAt" = public.now_ms(), "updatedAt" = public.now_ms() where id = v_cycle;
  end if;

  return v_entry::uuid;
end;
$$;

-- ---------------------------------------------------------------- grants

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('receive_money', 'set_view_mode', 'set_spend_until', 'set_keep_bucket', 'set_no_spend')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
