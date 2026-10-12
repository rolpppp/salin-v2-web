# Live schema rollout (web → `salin-v2`, ref `nopfvizscdxzvissibwn`)

Owner-approved Oct 12, 2026. **The owner runs every command that touches live** (CLAUDE.md hard rule). Claude prepares, checks outputs, and diffs.

## What goes live
- All files in `supabase/migrations/` **except** the baseline (`20261011000000`, already live; it is marked applied, not run).
- New web tables, functions and their grants (additive; mobile never reads them).
- P-5 triggers on `ledger_entries` (phone spending → buckets, phone income → Money in). They never raise: a failure logs a `WARNING` and the phone's upload succeeds. Owner chose: include, then verify with one real phone sync.
- **Not** live: `supabase/held/d16_synced_updated_at_triggers.sql` (server-time `updatedAt` on the 12 synced tables). Mobile's pull still uses the phone clock (`supabase_sync_provider.dart`: `serverTime: nowMs`), so D-16 stays held until that's fixed.

## Steps (prefix each with `!` in Claude Code so the output lands in the chat)

**0. Deploy folder (never link the repo folder).**
```
mkdir -p ~/salin-live-deploy/supabase && cd ~/salin-live-deploy
cp /Volumes/RolfStuffs/Developer/salin-v2-web/supabase/config.toml supabase/
cp -R /Volumes/RolfStuffs/Developer/salin-v2-web/supabase/migrations supabase/
supabase link --project-ref nopfvizscdxzvissibwn
```

**1. Backup.** Dashboard → Database → Backups: note the latest backup time (or enable PITR). Plus a local copy:
```
supabase db dump --linked -f backup_schema.sql
supabase db dump --linked --data-only -f backup_data.sql
```

**2. Drift check (read-only).** Has mobile changed the schema since the Oct 11 baseline?
```
supabase db dump --linked --schema public -f live_now.sql
```
Claude diffs `live_now.sql` against the baseline. Any table/column change → stop and reconcile first.

**3. Migration history.**
```
supabase migration list --linked
```
Expect the remote column empty. Then mark the baseline as already applied:
```
supabase migration repair --status applied 20261011000000 --linked
```

**4. Dry run, then push.**
```
supabase db push --linked --dry-run
supabase db push --linked
```
The dry run must list exactly the 12 web migrations: `20261011000100` … `20261012000100` and `20261012000200_balance_adjustments`. Anything else → stop.

**5. Verify (Dashboard → SQL editor, read-only).**
```sql
select tgname from pg_trigger where tgrelid = 'public.ledger_entries'::regclass and not tgisinternal order by 1;
-- expect: ledger_entries_adjustment_bucket_ins, ledger_entries_adjustment_bucket_upd,
--         ledger_entries_entry_bucket_ins, ledger_entries_entry_bucket_upd, ledger_entries_income_recognition_ins
-- and NOT ledger_entries_set_updated_at
select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('user_profiles','buckets','allocations','entry_buckets','income_meta');
```

**6. Web.** Open the Vercel site, sign in → `/welcome` should load the app path ("Found your Salin data").

**7. Phone sync check.** On the phone: add one expense and one income, sync. Then:
- Dashboard → Logs → Postgres, search `WARNING` for the last 15 min: expect none from `trg_entry_bucket_upsert`, `trg_income_recognition` or `trg_adjustment_bucket`.
- Phone shows both entries normally after a pull; web shows the income in Money in.

## Rollback
- **Phone sync misbehaves:** run `supabase/rollback/p5_triggers_off.sql` in the SQL editor (instant, no data loss).
- **Full rollback:** restore from the step-1 backup (PITR or `backup_*.sql`). The web objects are additive, so mobile is unaffected by leaving them in place.
