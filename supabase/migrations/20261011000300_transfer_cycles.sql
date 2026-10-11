-- =============================================================================
-- P-3: transfer cycles.
-- Confirmed allocations belong to a transfer cycle. At most one cycle is open per
-- user. transfer_checks.periodKey = cycle id (text). Only the latest cycle can be
-- unticked. Also adds two small ordering/bookkeeping columns on web-only tables:
--   allocations.seq            deterministic row order (checklist rows, tests)
--   transfer_checks.transferIds every mobile transfer written for the pair in the cycle
--                               (a "send more" tick writes a second, delta transfer)
-- =============================================================================

create table public.transfer_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seq bigint generated always as identity,
  "openedAt" bigint not null default public.now_ms(),
  "closedAt" bigint,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- At most one open cycle per user (P-3).
create unique index transfer_cycles_one_open_uq on public.transfer_cycles (user_id)
  where "closedAt" is null and "deletedAt" is null;
create index transfer_cycles_user_idx on public.transfer_cycles (user_id, seq);

alter table public.transfer_cycles enable row level security;
revoke all on public.transfer_cycles from anon, authenticated;
create policy "transfer_cycles_select_own" on public.transfer_cycles for select to authenticated using (user_id = (select auth.uid()));
create policy "transfer_cycles_insert_own" on public.transfer_cycles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "transfer_cycles_update_own" on public.transfer_cycles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- No delete policy: cycles are history (soft delete only).
grant select, insert, update on public.transfer_cycles to authenticated;
create trigger transfer_cycles_set_updated_at before insert or update on public.transfer_cycles
  for each row execute function public.set_updated_at_ms();

-- allocations."transferCycleId": mandatory for new rows. NOT VALID so any pre-existing
-- row (none expected) is not rejected; every new row must carry a cycle.
alter table public.allocations add column "transferCycleId" uuid references public.transfer_cycles (id) on delete restrict;
alter table public.allocations add constraint allocations_cycle_required check ("transferCycleId" is not null) not valid;
create index allocations_transfercycleid_idx on public.allocations ("transferCycleId");

alter table public.allocations add column seq bigint generated always as identity;
create index allocations_user_seq_idx on public.allocations (user_id, seq);

alter table public.transfer_checks add column "transferIds" text[] not null default '{}';
