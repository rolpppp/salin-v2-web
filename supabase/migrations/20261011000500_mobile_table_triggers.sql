-- P-5: NOT APPLIED TO LIVE until tested with a real mobile sync.
-- =============================================================================
-- Triggers on the mobile-synced table ledger_entries (DATA_MODEL 4.2, 4.3).
-- Every trigger body is wrapped in begin ... exception when others then raise warning,
-- so a bug here can never fail a mobile upsert (P-5).
-- Mobile pushes by upsert (insert ... on conflict do update), so the UPDATE triggers fire
-- on every push: their WHEN clauses make that path free unless something relevant changed,
-- and every write is idempotent.
-- =============================================================================

create or replace function public.trg_entry_bucket_upsert()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare v_bucket uuid;
begin
  begin
    select cb."bucketId" into v_bucket from public.category_buckets cb
     where cb.user_id = new.user_id and cb."categoryId" = new."categoryId" and cb."deletedAt" is null;
    if v_bucket is not null then
      insert into public.entry_buckets (user_id, "ledgerEntryId", "bucketId", source)
      values (new.user_id, new.id, v_bucket, 'category')
      on conflict (user_id, "ledgerEntryId")
      do update set "bucketId" = excluded."bucketId"
         where public.entry_buckets.source <> 'override' and public.entry_buckets."bucketId" is distinct from excluded."bucketId";
    end if;
  exception when others then
    raise warning 'trg_entry_bucket_upsert failed for entry %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

create trigger ledger_entries_entry_bucket_ins after insert on public.ledger_entries
  for each row when (new.direction = 1 and new.origin <> 3 and new."categoryId" is not null)
  execute function public.trg_entry_bucket_upsert();
create trigger ledger_entries_entry_bucket_upd after update on public.ledger_entries
  for each row when (new.direction = 1 and new.origin <> 3 and new."categoryId" is not null
                     and old."categoryId" is distinct from new."categoryId")
  execute function public.trg_entry_bucket_upsert();

create or replace function public.trg_income_recognition()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare v_src uuid;
begin
  begin
    if exists (select 1 from public.income_meta m where m.user_id = new.user_id and m."ledgerEntryId" = new.id) then
      return null;
    end if;
    if new."categoryId" is not null then
      select s.id into v_src from public.income_sources s
       where s.user_id = new.user_id and s."categoryId" = new."categoryId" and s."deletedAt" is null and not s."isArchived"
       order by s."createdAt", s.id limit 1;
    end if;
    if v_src is null then
      -- uncategorised / unmatched: the Others source, but only once the user has onboarded
      if not exists (select 1 from public.user_profiles p where p.user_id = new.user_id and p."onboardedAt" is not null) then
        return null;
      end if;
      perform pg_advisory_xact_lock(hashtextextended('salin:others:' || new.user_id::text, 0));
      select s.id into v_src from public.income_sources s
       where s.user_id = new.user_id and s.kind = 'other' and s.name = 'Others' and s."deletedAt" is null
       order by s."createdAt", s.id limit 1;
      if v_src is null then
        insert into public.income_sources (user_id, name, kind, rule) values (new.user_id, 'Others', 'other', 'ask')
        returning id into v_src;
      end if;
    end if;
    insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job)
    values (new.user_id, new.id, v_src, null)
    on conflict (user_id, "ledgerEntryId") do nothing;
  exception when others then
    raise warning 'trg_income_recognition failed for entry %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

create trigger ledger_entries_income_recognition_ins after insert on public.ledger_entries
  for each row when (new.direction = 0 and new.origin <> 3 and new."deletedAt" is null)
  execute function public.trg_income_recognition();

-- One-off, called at first plan setup: map existing spending by the CURRENT category map.
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
  return n;
end;
$$;
revoke all on function public.backfill_entry_buckets(uuid) from public, anon;
grant execute on function public.backfill_entry_buckets(uuid) to authenticated;
