# Data model

One Supabase Postgres database serves mobile and web. **Add tables; never change the 12 tables mobile syncs.** Mobile ignores tables it doesn't pull, so new tables are safe.

> **Before Phase 0 types are generated:** dump the live schema (`supabase db dump --schema public`) and confirm the column names really are camelCase as below. The mobile repo has no SQL; the Drift schema (`lib/core/database/tables/tables.dart`) and the sync code are the only source. Commit the dump as the first migration so the schema lives in the repo.

## 1. Existing tables (mobile-owned)

### 1.1 How mobile syncs

- Local-first (Drift/SQLite). Sync is **opt-in** (`settings.syncEnabled`); users with sync off have nothing in Supabase.
- **Push:** for each table, `upsert` of Drift's `toJson()` rows with `user_id` added and `updatedAt` = the phone's clock in ms (`supabase_sync_provider.dart`).
- **Pull:** `select * where user_id = me and updatedAt > lastSyncAt` for 10 main tables and 2 relation tables.
- Keys are **camelCase** (`accountType`, `amountMinor`, `deletedAt`) except `user_id`. Timestamps are **integer ms since epoch (UTC)**. Amounts are **integer minor units**. Enums are **integers by Dart declaration order**.
- `settings` and `media` are local only. `backups` (encrypted blobs) is remote only.

### 1.2 The 12 synced tables

| Table | Columns the web uses | Web reads | Web writes |
|---|---|---|---|
| `accounts` | id, name, accountType, openingBalanceMinor, currency, icon, color, displayOrder, isArchived, createdAt, updatedAt, deletedAt, syncStatus | ✓ | create, rename, retype, archive (`isArchived`) |
| `categories` | id, name, icon, color, categoryType, isSystem, displayOrder, … | ✓ | create, rename, soft delete (only if unused) |
| `ledger_entries` | id, accountId, categoryId, transferId, amountMinor (always positive), direction, origin, occurredAt, note, metadataJson, … | ✓ | income (inflow, `origin = manual`), transfer legs |
| `transfers` | id, fromAccountId, toAccountId, note, … | ✓ | when a transfer is ticked |
| `budgets`, `budget_categories` | category budgets | ✓ (Decision 1: nest under buckets) | no (v1) |
| `recurring_rules`, `recurring_instances` | bills | ✓ (future: next payday) | no |
| `contacts`, `debts`, `splits`, `split_participants` | IOUs | no (v1) | no |

**Transfers the mobile way** (`transaction_repository_impl.dart`): one `transfers` row with id `T`, plus two `ledger_entries`: `T_out` (outflow, accountId = from) and `T_in` (inflow, accountId = to), both `origin = transfer (3)`, `transferId = T`, same `amountMinor` and `occurredAt`. Unticking soft-deletes all three (`deletedAt = now`).

**Writing rows mobile will pull:** include every non-null column Drift expects (e.g. `icon`, `color`, `displayOrder`, `isSystem`, `syncStatus = 2 (synced)`, `createdAt`), or mobile's `fromJson` will throw. Write a fixture test that round-trips a web-created row through the Dart model.

### 1.3 Enum map (frozen; never reorder)

| Enum | Values (index = stored integer) |
|---|---|
| `AccountType` | 0 cash · 1 bank · 2 savings · 3 eWallet · 4 creditCard · 5 debitCard · 6 investment |
| `MoneyDirection` | 0 inflow · 1 outflow |
| `LedgerOrigin` | 0 manual · 1 quickAdd · 2 recurring · 3 transfer · 4 debtSettlement · 5 splitSettlement · 6 adjustment · 7 import · 8 migration |
| `CategoryType` | 0 income · 1 expense |
| `BudgetPeriod` | 0 weekly · 1 monthly · 2 quarterly · 3 yearly · 4 custom |
| `RecurringFrequency` | 0 daily · 1 weekly · 2 monthly · 3 quarterly · 4 yearly · 5 custom |
| `RecurringInstanceStatus` | 0 pending · 1 generated · 2 paid · 3 skipped · 4 cancelled |
| `DebtStatus` / `SplitStatus` | 0 active · 1 paid/settled · 2 cancelled |
| `SyncStatus` | 0 localOnly · 1 pendingUpload · 2 synced · 3 pendingDelete · 4 conflicted |
| `WeekStart` | 0 sunday · 1 monday |

Put this map in one file (`lib/domain/enums.ts`) with a test that fails if it doesn't match `financial_enums.dart` (CI fetches the Dart file).

The prototype's account types map as: Bank → bank, E-wallet → eWallet, E-wallet + cash → eWallet (v1; consider a `cash` account split), Cash → cash, Savings → savings, Investment → investment, Credit card → creditCard.

## 2. New tables (web-owned)

Conventions for every new table: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users`, camelCase columns to match mobile (`"createdAt" bigint`, `"updatedAt" bigint`, `"deletedAt" bigint null`, ms epoch), money `bigint` minor units, currency ISO text, **new enums as `text` with a CHECK constraint**, foreign keys to mobile tables as `text`.

| Table | Key columns | Purpose |
|---|---|---|
| `user_profiles` | user_id (PK), firstName, homeCurrency, weekStartsOn, reviewDay, nextPaydayDate, payFrequency (`monthly`/`twice`/`biweekly`/`weekly`/`varies`), planMode (`plan`/`track`), priority (`safety`/`goal`/`grow`/`control`), onboardingPath (`web`/`app`), onboardingDraft jsonb (answers so far, for resume), onboardedAt, paydayReminder (`email`/`none`) | Web settings and onboarding state |
| `buckets` | name, shortName, groupKey (`spend`/`save`/`set_aside`), hue (`living`/`fun`/…), note, keptInAccountId → accounts, planless bool, displayOrder, isArchived | Where money is assigned |
| `allocation_plans` | key (`A`,`B`), name, priority | Plan A, Plan B |
| `allocation_plan_lines` | planId, bucketId, percentBp (int, sum per plan = 10000) | The percentages (UI shows whole %) |
| `allocation_rules` | kind (`switch_on_goal`, `redirect_until_date`), params jsonb (`{fromPlan, toPlan, bucketId, targetMinor}` / `{fromBucketId, toBucketId, untilDate}`) | Plan switch, rent redirect |
| `income_sources` | name, kind (`salary`/`scholarship`/`side_hustle`/`allowance`/`gift`/`refund`/`other`), rule (`plan`/`own`/`whole`/`ask`), wholeBucketId, landsInAccountId, categoryId → categories (income), isArchived | Sources and their rules |
| `income_source_split_lines` | sourceId, bucketId, percentBp | Own split (may total ≠ 10000; then unusable, BR §2.1.4) |
| `income_meta` | ledgerEntryId (unique) → ledger_entries, sourceId, job (`plan`/`own`/`whole`/`one`/null), oneBucketId, sentMinor, sentCurrency | Per-income job choice and A$ sent. Rate is derived. |
| `allocations` | ledgerEntryId, bucketId, amountMinor, destAccountId (snapshot), planKey, percentBp, ruleTrace jsonb, confirmedAt | One row per bucket per confirmed income. **Immutable** (no update policy). |
| `transfer_checks` | fromAccountId, toAccountId, sentMinor, transferId → transfers, periodKey | Amount actually sent per account pair (BR §3.6–3.7) |
| `category_buckets` | categoryId (unique per user), bucketId, source (`auto`/`user`) | Expense category → bucket. Only `auto` rows may be moved by a later plan change (BR §12.5) |
| `entry_buckets` | ledgerEntryId (unique), bucketId, source (`category`/`override`) | Snapshot of each spending entry's bucket at log time (BR §4.1) |
| `bucket_covers` | fromBucketId, toBucketId, amountMinor, occurredAt, note | Covers (Buffer → Living) |
| `goals` | name, targetMinor, currency, linkedBucketId, linkedShareBp (e.g. 5000 for half of Sinking), isPlanSwitch bool, dueDate, isArchived | Targets |
| `week_reviews` | weekStart (date), closedAt, checks jsonb, safeToSpendMinor, observation text | Closed weeks |
| `fx_rates` (Phase 2) | date, base, quote, rateMicros (shared, read-only) | Daily rates |
| `balance_snapshots` (Phase 2) | accountId, balanceMinor, asOf | Reconcile, net worth |
| `events` (if not PostHog) | name, props jsonb, occurredAt | Analytics |

Unique constraints: one active `allocation_plans.key` per user; one `category_buckets` per category; one `entry_buckets` per entry; one `income_meta` per entry; account names unique per user among non-archived (enforce in the web; mobile doesn't).

## 3. Functions (SQL)

| Function | Does |
|---|---|
| `split_by_plan(amount bigint, plan_key text, on_date date) → table(bucket_id, amount)` | BR §2.2 incl. rent redirect and remainder |
| `split_own(amount bigint, source_id uuid) → table` | BR §2.3; raises if lines ≠ 10000 |
| `active_plan(user uuid) → text` | BR §2.2.1, measure behind one function (D-14) |
| `confirm_incomes(entry_ids uuid[]) → setof allocations` | In one transaction, in date order: resolve job, compute split, write `allocations` with dest snapshots. Raises on any income without a job. Idempotent per entry. |
| `bucket_left(user uuid) → table(bucket_id, left)` | BR §4.2 |
| `transfer_plan(user uuid) → table(from, to, amount, netted, sent)` | BR §3.1–3.7 |
| `account_should_hold(user uuid) → table(account_id, amount)` | BR §5.1 |
| `tick_transfer(from text, to text, amount bigint)` / `untick_transfer(...)` | Writes/soft-deletes `transfers` + legs + `transfer_checks` atomically |
| `suggest_plan(inputs jsonb) → jsonb` | BR §12.1–12.2 (also mirrored in `lib/money` for the live preview; same golden tests O1–O5) |
| `finish_onboarding(draft jsonb) → void` | One transaction: creates/updates accounts (web path), buckets with homes, plans + rule rows, income sources, categories + `category_buckets`, goals, `user_profiles` (onboardedAt), and, if the first pay was confirmed, its income entry (web path) + `confirm_incomes` + ticked transfers. Idempotent per user. |
| `apply_plan_only(draft jsonb) → void` | "Make a plan" after just tracking: plans, homes, rules, `auto` category moves, Emergency goal; never touches allocations |

All `security invoker` so RLS applies. Mirror `split_by_plan` and `split_own` in `lib/money` for previews; a Vitest suite runs the same golden cases as pgTAP.

## 4. Triggers

1. **Server-time `updatedAt`** on all 12 synced tables and all new tables: `before insert or update … set "updatedAt" = (extract(epoch from now()) * 1000)::bigint`. Mobile currently stamps the phone's clock; this fixes pulls skipping rows. Check with mobile first: its pull compares against its own clock (`serverTime = DateTime.now()` on the phone), so test with a skewed phone clock before enabling (DECISIONS.md D-16).
2. **`entry_buckets` on spending:** after insert on `ledger_entries` where direction = outflow and origin ≠ transfer and categoryId is mapped → insert `entry_buckets(source = 'category')`. On categoryId update, update the entry's bucket unless `source = 'override'`. Category moves never touch existing rows.
3. **Income recognition:** after insert on `ledger_entries` (inflow, origin ≠ transfer) with a categoryId that belongs to an `income_sources.categoryId` → insert `income_meta` (job null) so it appears in Money in. Inflows with no matching source go to the "Others" source.
4. **Immutability:** `allocations` has no update policy; deletes only through a future "undo confirm" function (Decision 5).

## 5. RLS

Every table: `enable row level security`; policies `using (user_id = auth.uid()) with check (user_id = auth.uid())` for select/insert/update; no delete policy on synced tables (soft delete only). `fx_rates`: select for authenticated, no writes. pgTAP test per table: user B can't select, insert, update or delete user A's rows.

## 6. Migration order

1. Baseline: dump of the live schema (no changes).
2. Server-time `updatedAt` trigger (behind D-16 test).
3. New tables + RLS + indexes (`user_id`, foreign keys, `ledger_entries(user_id, occurredAt)`).
4. Functions (`split_by_plan` … `transfer_plan`) + pgTAP golden tests.
5. Triggers 2–3, with a one-off backfill of `entry_buckets` for existing spending (mapped by current categories, `source = 'category'`, flagged as backfilled).
6. Seed per-user defaults on first plan setup (buckets, Plan A/B, rules, sources, category map) from the chosen preset, never globally.

## 7. Mapping the prototype to the model

| Prototype | Real |
|---|---|
| `state.inbox` | inflow `ledger_entries` with `income_meta` and no `allocations` |
| `state.paydays` / `state.done` | `allocations` grouped by `ledgerEntryId` |
| `it.how` | `income_meta.job` |
| `alloc` / `dest` | `allocations.amountMinor` / `destAccountId` |
| `state.moves[key] = sent` | `transfer_checks.sentMinor` |
| `state.spends` (b, cat) | outflow `ledger_entries` + `entry_buckets` |
| `state.covers` | `bucket_covers` |
| `BUCKETS[].acct` | `buckets.keptInAccountId` |
| `state.sources` / `.own` | `income_sources` / `income_source_split_lines` |
| `state.cats[].b` | `category_buckets` |
| `state.goals` | `goals` |
| `state.weekClosed` | `week_reviews` |
| `ob` (onboarding answers) | `user_profiles.onboardingDraft` until finish, then the tables above |
| `state.starting` / `firstStep` | derived: first week after `onboardedAt`, `planMode` |
| `spends[].pre` | derived: entry created before `onboardedAt` |
| Log spending sheet | outflow `ledger_entries` + `entry_buckets` (trigger) |
| Account **names** used as ids | `accounts.id` everywhere |
