-- KILL SWITCH (P-5): stop the web's triggers on the mobile ledger_entries table.
-- Use if phone sync misbehaves after the web schema went live. Instant, no data loss:
-- phone uploads go back to exactly what they did before the web existed. The web keeps
-- working but stops seeing new phone spending/income until the triggers are re-created
-- (re-run the `create trigger` statements from migrations/20261011000500_mobile_table_triggers.sql
-- and 20261012000200_balance_adjustments.sql).
begin;
drop trigger if exists ledger_entries_entry_bucket_ins on public.ledger_entries;
drop trigger if exists ledger_entries_entry_bucket_upd on public.ledger_entries;
drop trigger if exists ledger_entries_income_recognition_ins on public.ledger_entries;
drop trigger if exists ledger_entries_adjustment_bucket_ins on public.ledger_entries;
drop trigger if exists ledger_entries_adjustment_bucket_upd on public.ledger_entries;
commit;
