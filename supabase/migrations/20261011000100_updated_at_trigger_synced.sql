-- =============================================================================
-- D-16: DO NOT APPLY TO LIVE until the mobile pull fix ships.
-- Mobile pull compares "updatedAt" against the phone clock; stamping server time
-- here can make a phone that runs ahead of the server miss web edits.
-- Applies local-only until then.
-- =============================================================================

-- Shared by the 12 synced tables and every new web table. Ignores any client value.
create or replace function public.set_updated_at_ms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new."updatedAt" := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end;
$$;

create trigger accounts_set_updated_at before insert or update on public.accounts
  for each row execute function public.set_updated_at_ms();
create trigger categories_set_updated_at before insert or update on public.categories
  for each row execute function public.set_updated_at_ms();
create trigger budgets_set_updated_at before insert or update on public.budgets
  for each row execute function public.set_updated_at_ms();
create trigger budget_categories_set_updated_at before insert or update on public.budget_categories
  for each row execute function public.set_updated_at_ms();
create trigger recurring_rules_set_updated_at before insert or update on public.recurring_rules
  for each row execute function public.set_updated_at_ms();
create trigger recurring_instances_set_updated_at before insert or update on public.recurring_instances
  for each row execute function public.set_updated_at_ms();
create trigger contacts_set_updated_at before insert or update on public.contacts
  for each row execute function public.set_updated_at_ms();
create trigger debts_set_updated_at before insert or update on public.debts
  for each row execute function public.set_updated_at_ms();
create trigger splits_set_updated_at before insert or update on public.splits
  for each row execute function public.set_updated_at_ms();
create trigger split_participants_set_updated_at before insert or update on public.split_participants
  for each row execute function public.set_updated_at_ms();
create trigger transfers_set_updated_at before insert or update on public.transfers
  for each row execute function public.set_updated_at_ms();
create trigger ledger_entries_set_updated_at before insert or update on public.ledger_entries
  for each row execute function public.set_updated_at_ms();
