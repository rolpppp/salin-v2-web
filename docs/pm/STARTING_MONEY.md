# Starting money: sort real balances into buckets, move between buckets (ticket 38, owner request Oct 16)

The owner, with screenshots of Plans → Accounts and Today's "Your buckets": "I have balances on different accounts, but the bucket says I have Spending bucket only active. It should sort automatically and let me adjust the bucket allocation. It doesn't make sense."

What is wrong today:

- **Buckets only know money that came in through the app** (confirmed paydays, "I got money", first pay). Money already sitting in accounts (opening balances, phone-synced entries, anything from before the plan) belongs to no bucket, so Emergency, Investment, Goals, Buffer show ₱0 while MariBank, Cash, GoTrade really hold money.
- **Plans → Accounts never shows the real balance.** The big number is `account_should_hold` ("should be here, by your buckets"), so every account without allocations reads ₱0.00 even when it holds money.
- **Ticket 34's Sort card can't help:** it only re-labels money buckets already know about (`engine_unsorted_money` reads allocations).
- **No way to move money between buckets** except "Cover from Buffer" when a bucket is overspent. Split percentages only change future paydays.

## Decisions (P-14, owner answers Oct 16)

1. **Starting money is a new kind of money into a bucket**, like an allocation line with a destination account but with no income entry. New web table `bucket_starts` (`id`, `user_id`, `"bucketId"` → buckets, `"accountId"` text → accounts (SET NULL), `"amountMinor" bigint > 0`, `"batchId" uuid` (one Save), `note`, `"occurredAt"`, camelCase `createdAt/updatedAt/deletedAt`). RLS + pgTAP. Not a mobile table; mobile never sees it.
2. **Unbucketed money per PHP account** = real balance (opening + Σ inflow − Σ outflow over live entries, as `lib/data/balances.ts` computes) − `should_hold`. Positive → "₱X here isn't in a bucket yet" (sortable). Negative → "Your buckets count ₱X more than is here" (not sortable; point to logging the missed spending or Update balances from ticket 22). Foreign-currency accounts are left out.
3. **Suggested sort (pre-filled, the user edits every amount before saving; nothing moves without Save):**
   - Account that keeps one or more live buckets → split its unbucketed money among those buckets **by the active plan's percentages** (only among them; renormalised; remainder per BUSINESS_RULES §2.4). Planless buckets and 0% lines get 0. If they are all 0%, everything goes to the first of them by display order.
   - Account that keeps no bucket (e.g. Cash, Maya) → all to **Spending** (the Spend-group `living` bucket; if none, the first live Spend-group bucket).
   - The money stays where it is: a start line records the account it sits in (`accountId`), even when the bucket is kept elsewhere. No transfer row is created.
4. **Starting money counts everywhere a bucket's money counts:** `engine_bucket_left` (fold into `allocated`, or a new column if you also update every caller and TS mirror), `engine_account_should_hold` (count it at `"accountId"`, the way allocations count at `destAccountId`), `engine_unsorted_money` (a start at an account other than the bucket's kept-in account is sortable like a misplaced allocation, if that account keeps other buckets), and the `lib/money` TS mirrors + parity. After a sort that fills every gap, every PHP account's `should_hold` equals its real balance.
5. **Review honesty.** The week slip identity (BR §6.3) must still hold. Starting money is not income: it never appears in "Came in" as pay. Add or reuse a line ("Money you already had: ₱X") so the slip reconciles in the week it was sorted. pgTAP proves it.
6. **Undo.** Right after Save, an Undo soft-deletes that batch (`unsort_start(p_batch)`). Later, a start row can be removed from the bucket drawer's history ("Remove", soft delete). Nothing else edits starts in place.
7. **Move between buckets** (owner's "adjust the bucket allocation"): from a bucket's drawer, **Move to another bucket** → amount (capped at that bucket's left) + target bucket. Writes one `bucket_covers` row (`note = 'move'`). If the two buckets are kept in different accounts, the sheet says so plainly: "Also move ₱X from MariBank to GCash in your apps" (and Accounts will show the gap until balances match). Check whether the transfer checklist / Next step already reacts to covers across accounts; report what you find, don't build a new transfer type. Changing split percentages for future paydays stays in Plans → Split plan; the drawer links there.
8. **Never automatic.** BR §4.3 "never move money automatically" stands: the suggestion is pre-filled, Save is the user's.

## SQL (new migration `20261016000300_starting_money.sql`; SECURITY INVOKER, `assert_self`, `P0001` user-facing refusals, `22023` bad input, `42501` ownership)

| Function | Behaviour |
|---|---|
| `account_balances()` | per live PHP account: real balance, should_hold, unbucketed (= balance − should_hold). Mirror in TS. |
| `start_buckets(p_lines jsonb)` → `uuid` (batch id) | lines `[{"bucketId", "accountId", "amountMinor"}]`. One txn, advisory lock like `sort_money`. Each line > 0, bucket live & the user's, account the user's live PHP account. Σ per account ≤ that account's unbucketed (refuse with the amount still free). |
| `unsort_start(p_batch uuid)` / `remove_start(p_id uuid)` | soft delete. Allowed even if a bucket's left goes negative (it then shows "Needs ₱X", honestly); the confirm copy says so. |
| `move_between_buckets(p_from uuid, p_to uuid, p_amount bigint)` | `bucket_covers` row, note `'move'`; amount ≤ left(from); from ≠ to; both live. |
| engine changes | per decision 4, all existing pgTAP/parity green. |

pgTAP: golden case from the owner's screenshot (GCash keeps Spending + Fun Money, MariBank keeps Emergency/Buffer/Goals, GoTrade keeps Investment, Cash keeps none; real balances on each; sort → each bucket's left and each account's should_hold = real balance), over-sorting refuses, foreign account refuses, RLS on `bucket_starts` (user B can't read/write A), undo restores, move caps at left, slip identity holds in the sort week.

## Data, actions, UI (read `salin-web-handoff/DESIGN.md`; reuse `components/*`, ticket 34's `SortMoneyCard` patterns)

- `lib/money/starting.ts` (pure, Vitest): `suggestStart({ accounts: [{ id, unbucketedMinor, keptBuckets: [{ id, percentBp, planless, displayOrder }] }], spendingBucketId })` → lines; `sum(lines per account) === unbucketed` for every account; table-driven tests incl. all-0%, rounding, no-bucket account, negative gap ignored.
- `lib/actions/starting.ts`: `startBuckets`, `undoStart`, `removeStart`, `moveBetweenBuckets` (Zod, `ActionResult`, revalidate `/today`, `/plans/accounts`, `/review`). Analytics: `starting_money_sorted` (account count, amount band), `bucket_moved`.
- **Plans → Accounts:** the big number becomes the **real balance** ("in the account"); under it "₱Y by your buckets" and, when they differ, a chip: "₱X not in a bucket yet" or (coral) "₱X less than your buckets say". AUD accounts unchanged.
- **Sort card** ("Sort the money you already have"), shown on Today (Full view) and on Plans → Accounts while any PHP account has unbucketed > 0: one group per account ("MARIBANK · ₱12,000 to sort"), one amount row per suggested bucket (editable `MoneyInput`, a bucket picker to add a row), live "₱X left to sort" per account, one **Save**, then Undo. Merge with ticket 34's card if it reads cleanly as one card; otherwise show this one first. "Not now" hides it for this set of amounts (same as ticket 34).
- **Bucket drawer** (`components/today/BucketDrawerBody.tsx`): **Move to another bucket** sheet; history lists starting money ("Money you already had in MARIBANK") and moves.
- Simple view: no new UI, but its numbers follow (Spending's left rises after a sort). Check Simple Today still renders and its accounts card is unchanged.

Accessibility: labels, 44px targets, visible focus, AA light/dark, 390px no horizontal scroll.

## Tests to leave green

lint, typecheck, `npm test`, build, `npm run db:reset && npm run db:test`, `npm run test:parity`, `npm run test:mobile-compat`, full Playwright. New `tests/e2e/starting-money.spec.ts`: a user with opening balances on 4 accounts (one keeps no bucket) → Accounts shows real balances and gaps → sort card pre-filled per P-14 → edit one amount → Save → buckets show the money, gaps gone → Undo restores; move between buckets in different accounts shows the reminder; 390px. Known flakes: `transfers.spec.ts:119`, tour.spec on desktop-dark.
