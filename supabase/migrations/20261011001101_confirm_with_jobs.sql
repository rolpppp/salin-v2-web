-- =============================================================================
-- Ticket 10 (Money in): confirm_incomes_with_jobs.
--
-- The Money in screen lets the user pick a job per income (Use its rule / Split by my plan /
-- One-off to a bucket) and then confirm one or many. confirm_incomes() reads the job from
-- income_meta, so the picks must be saved first. Doing both in two round trips could leave a
-- pick saved while the confirm failed, so this wrapper does both in ONE transaction:
-- a refused confirm rolls the picks back too.
--
-- Rules followed (see the engine migration): SECURITY INVOKER (RLS applies), search_path = public,
-- updatedAt set explicitly, no hard delete, integer money (this function moves none itself).
-- It does not change confirm_incomes() or any table.
--
-- p_jobs: json array of {"id": <ledger entry id>, "job": "plan"|"own"|"whole"|"one"|null,
--                        "oneBucketId": <bucket uuid>|null}
--   job null          = clear the pick, so the source's rule decides (BR 2.1.2)
--   oneBucketId       = only kept for job 'one'; null there means the Emergency fund (BR 2.5)
-- An entry that is already confirmed is left alone (confirm_incomes skips it too).
-- =============================================================================

create or replace function public.confirm_incomes_with_jobs(entry_ids text[], p_jobs jsonb default '[]'::jsonb)
returns setof public.allocations
language plpgsql volatile security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  j record;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_jobs is null or jsonb_typeof(p_jobs) <> 'array' then
    raise exception 'p_jobs must be a json array' using errcode = '22023';
  end if;

  for j in
    select x.id, x.job, x."oneBucketId"
      from jsonb_to_recordset(p_jobs) as x(id text, job text, "oneBucketId" uuid)
  loop
    if j.id is null or not (j.id = any (coalesce(entry_ids, '{}'::text[]))) then
      raise exception 'a job was given for an income that is not being confirmed: %', coalesce(j.id, 'null') using errcode = '22023';
    end if;
    if j.job is not null and j.job not in ('plan', 'own', 'whole', 'one') then
      raise exception 'unknown job % for income %', j.job, j.id using errcode = '22023';
    end if;

    update public.income_meta m
       set job = j.job,
           "oneBucketId" = case when j.job = 'one' then j."oneBucketId" else null end,
           "updatedAt" = public.now_ms()
     where m.user_id = v_user and m."ledgerEntryId" = j.id and m."deletedAt" is null
       and not exists (select 1 from public.allocations a
                        where a.user_id = v_user and a."ledgerEntryId" = j.id and a."deletedAt" is null);
  end loop;

  return query select * from public.confirm_incomes(entry_ids);
end;
$$;

revoke all on function public.confirm_incomes_with_jobs(text[], jsonb) from public, anon;
grant execute on function public.confirm_incomes_with_jobs(text[], jsonb) to authenticated;
