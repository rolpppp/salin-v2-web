# Mobile compatibility check

Proves that rows the web writes to the mobile-synced tables (`accounts`, `categories`, `ledger_entries`, `transfers`) are accepted by the **real** Flutter app code. If a web-written row has a missing column or a wrong type, the phone's Drift `fromJson` throws and sync breaks.

## What it does
1. `generate-fixtures.ts` runs every builder in `lib/domain/mobile/` and writes rows shaped like PostgREST `select *` (camelCase keys plus `user_id`) to `fixtures/<table>/gen-*.json`. It includes null optionals, max amounts, non-ASCII names and soft-deleted rows.
2. `dart/test/compat_test.dart` (a small Flutter package with a `path:` dependency on the mobile repo) loads every `*.json` in the fixture folders and:
   - replays what `SyncService._pullRemoteChanges` does: `Row.fromJson(record)` (with `user_id`), then `fromJson({...record, syncStatus: 2})` and `toCompanion(true)`, and checks that every column survives;
   - decodes the enum indexes with the Dart enums;
   - runs the real `SyncService.synchronize()` against an in-memory `AppDatabase` with a fake provider that returns all fixtures, then checks the SQLite rows.

## Run
```
npm run test:mobile-compat
```
It skips with a message if `flutter` is not on PATH or the mobile repo is missing. The mobile repo is expected at `../salin-v2` next to this repo; otherwise set `SALIN_MOBILE_PATH=/path/to/salin-v2`. The mobile repo is only read, never modified. The fixture root can be overridden with `SALIN_FIXTURES` when running `flutter test` directly in `dart/`.

## Add DB-exported fixtures
Export rows from local Supabase after running a SQL function (for example `tick_transfer`), for instance:
```
psql "$LOCAL_DB_URL" -At -c "select coalesce(json_agg(t), '[]') from transfers t where \"user_id\" = '<uuid>'" \
  > tests/mobile-compat/fixtures/transfers/db-tick-transfer.json
```
(do the same for `ledger_entries`, `accounts`, ...). A file may hold one row object or an array of rows. Any name that does not start with `gen-` is kept when fixtures are regenerated; `gen-*` files are overwritten. Rows must be exactly what PostgREST returns (`bigint` as JSON numbers, `user_id` present).
