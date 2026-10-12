-- =============================================================================
-- HELD (D-16): NOT a migration. `supabase db push` never sees this folder.
-- Server-time `updatedAt` on the 12 mobile-synced tables. Apply to live only after
-- the mobile pull stores the server's max "updatedAt" instead of the phone clock;
-- then move this file into supabase/migrations with a new timestamp.
-- Local tooling (scripts/db-local.sh, CI db job) applies it so pgTAP 04 keeps testing it.
-- =============================================================================

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
