# Simple Money: the daily view (ticket 28, owner request Oct 15)

The owner (first real user) wants one thing from the web app: **put in the money I got, choose which accounts it sits in, and see how much I can spend today, this week and the coming days.** It must feel simple, lovely and in his control, and give him a reason to open it every day. It must work for any income: a ₱1,500 weekly allowance, a ₱24k stipend that arrives every few months, or a salary. The existing full view (buckets, plans, Money in queue) stays; **Simple** is a second Today that sits on the same data.

## Principles

- **Few taps, one number.** The first thing on screen is *₱X left today*. Nothing else competes with it.
- **The user decides.** Every amount, the account split, how much to keep aside and the date the money must last until are typed or picked by the user. The app only suggests defaults.
- **No jargon.** No "bucket", "allocation", "plan" on the simple screens. Say *Spending*, *Kept aside*, *Move*.
- **Same data.** Everything written goes through the existing tables so the full view, Review, transfers and mobile keep working. Never alter the 12 mobile tables. Money is integer centavos.

## Decisions (P-11)

1. **View mode.** `user_profiles."viewMode"` = `'simple' | 'full'`, default `'full'` for existing rows (so current tests and users are unaffected). `/today` renders `SimpleToday` when `'simple'`. A toggle in the avatar menu ("Simple view" / "Full view") flips it. Onboarding "Just track" and the allowance kind set it to `'simple'` (small change in `finish_onboarding` is out of scope: the toggle is enough for now).
2. **Two kinds of money.** *Spending* = the `living` bucket (and any other Spend-group bucket, same as today's safe-to-spend). *Kept aside* = one bucket the user picks (default: the Emergency fund bucket). Simple view never shows percentages.
3. **Receive money** writes one inflow plus its allocation in one atomic SQL function (see below), with a new job `manual`: the user chose the exact peso amounts per account. Because each allocation line carries a snapshotted destination account, the **existing transfer checklist** works unchanged: the money *landed* in one account and lines whose destination is another account become "Move ₱X from A to B" rows.
4. **Make it last until.** `user_profiles."spendUntil"` (date, nullable) is the day the spending money must last to (the day the next money arrives; that day is *not* counted). Resolution order: `spendUntil` if ≥ today → else `nextPaydayDate` if ≥ today → else the end of this week (profile `weekStartsOn`). One tap on the hero lets the user pick: *End of this week* · *A date…* (a stipend months away works the same). The existing `daysUntil` semantics apply (min 1).
5. **Pace.** `pace = floor(spendableLeft / daysUntil)` where `spendableLeft` is Σ left over the Spend group (BR §4.2/4.4, same number as today's safe-to-spend). Left *today* = pace at the start of today − spent today, where pace at start of today = `floor((spendableLeft + spentToday) / daysUntil)`. Underspending rolls forward automatically (tomorrow's pace rises); overspending lowers it. Negative values are shown as is (coral, "₱X over, tomorrow adjusts").
6. **Week and coming days.** The week = 7 days from `weekStartsOn`. *Left this week* = `min(spendableLeft, pace × days remaining in the week including today)`. The **day strip** shows the 7 days of the week: past days show what was spent, today shows left today, future days show the current pace. Tapping a day lists its spending.
7. **Daily habit.** A **streak** of days on which the user logged at least one spend *or* marked **No spend today**. Table `day_checkins(user_id, day date, kind 'no_spend')`, one row per (user, day, kind). Streak counts back from today, or from yesterday if today has nothing yet (so it is never "broken" before the day ends). Copy is warm, never guilt ("Nothing yet today. Log it or mark a no-spend day."). Streak milestones (3, 7, 14, 30) get the existing `[data-burst]` reward once.
8. **Where your money is.** Accounts list on Simple = real ledger balance (opening + ledger entries, as `lib/data/balances.ts` computes) plus, per account, a line for **pending moves** ("₱500 to move to Cash"). Tapping the pending line opens the existing transfer checklist step. No "should hold" language here.
9. **Not in scope:** goals, plans, covers, review changes, multi-currency, editing a received payment (the full view has no undo either, D-5), email reminders.

## SQL contract (new migration `20261015000100_simple_money.sql`; SECURITY INVOKER, `assert_self`, RLS, soft deletes; `P0001` with a user-facing message on refusals, `22023` on bad input, `42501` on ownership)

| Change | Behaviour |
|---|---|
| `user_profiles."viewMode"` | text not null default `'full'`, check in (`simple`,`full`) |
| `user_profiles."spendUntil"` | date null |
| `user_profiles."keepBucketId"` | uuid null → a live bucket of the user (default resolved to Emergency when null) |
| `income_meta.job` check | gains `'manual'` |
| `day_checkins` table | `id`, `user_id`, `day date`, `kind text check ('no_spend')`, camelCase `createdAt/updatedAt/deletedAt` like other web tables; unique live (user_id, day, kind); RLS + pgTAP (user B cannot select/insert/update/delete A's rows) |
| `receive_money(p_amount bigint, p_received_in text, p_source_id uuid, p_name text, p_on date, p_lines jsonb)` → `uuid` (ledger entry id) | `p_lines` = `[{"bucketId": uuid, "destAccountId": text, "amountMinor": bigint}]`, each > 0, total **exactly** `p_amount`, buckets live, accounts the user's own non-archived PHP accounts (else `22023`/`42501`). One transaction: insert the inflow `ledger_entries` row on `p_received_in` (`origin = 0`, mobile-compatible columns as the existing Add income does; income category from the source, else the "Others" source), upsert `income_meta` (`job = 'manual'`), insert `allocations` (one row per line, `planKey = 'manual'` or null if the column allows, `ruleTrace = {"rule":"manual"}`, `confirmedAt = now`). If `allocations` has a unique (ledgerEntryId, bucketId), widen it to include `destAccountId` and re-check `bucket_left`, `transfer_plan`, `account_should_hold`, `confirm_incomes*` and the lib/money mirrors still agree. Idempotency not required. |
| `set_view_mode(p_mode text)` · `set_spend_until(p_day date)` (null clears) · `set_keep_bucket(p_bucket uuid)` | trivial setters |
| `set_no_spend(p_day date, p_on boolean)` | insert / soft-delete the check-in; day not in the future; at most 14 days back |

pgTAP: `receive_money` golden cases (single account; split across 3 accounts incl. a keep line; sum ≠ amount raises; foreign account raises; lines appear in `transfer_plan` as moves from the landed account), `day_checkins` RLS, setters. Existing suites stay green. Mobile-compat suite gets a fixture for a `receive_money` entry (inflow row must round-trip through the Dart model).

## Engine / data (TypeScript, `lib/money` + `lib/data`)

- `lib/money/pace.ts` (pure, Vitest): `pace({ spendableLeftMinor, spentTodayMinor, daysUntil })`, `weekStrip({ weekStart, today, spentByDay, spendableLeftMinor, daysUntil })`, `streak({ today, spendDays, noSpendDays })`. Table-driven tests: rounding, rollover, overspend, a 90-day horizon, streak across today-empty, week boundary, midnight in the user's timezone (use `lib/time`).
- `lib/data/simple-today.ts` builds the view model below from the same queries Today already runs (reuse `getBucketLefts`/`daysUntil`; do not fork the money math).

```ts
export type SimpleTodayModel = {
  firstName: string;
  todayLeftMinor: number;          // hero
  weekLeftMinor: number;
  paceMinor: number;
  until: { day: string; label: string; source: 'chosen' | 'payday' | 'week-end' };
  daysUntil: number;
  week: Array<{ day: string; label: string; state: 'past' | 'today' | 'future'; spentMinor: number; leftMinor: number | null }>;
  streak: { days: number; todayDone: boolean; noSpendToday: boolean; milestone: 3 | 7 | 14 | 30 | null };
  accounts: Array<{ id: string; name: string; balanceMinor: number; pendingInMinor: number; pendingOutMinor: number }>;
  spendableLeftMinor: number;      // all of Spending
  keptAsideMinor: number;          // everything not in the Spend group
  hasAccounts: boolean;
  receive: { accounts: Array<{ id: string; name: string }>; defaultReceivedInId: string | null; spendingBucketId: string; keepBucketId: string; sources: Array<{ id: string; name: string }>; lastSourceId: string | null };
};
```

- `lib/actions/simple.ts` (server actions, `ActionResult` like the others): `receiveMoney`, `setNoSpend`, `setViewMode`, `setSpendUntil`, `setKeepBucket`. Revalidate `/today`, `/money-in`. Analytics via `lib/analytics`: `money_received` (amount band only, account count), `no_spend_marked`, `streak_milestone`, `view_mode_changed`.

## UI (use the existing tokens, `components/*`, and motion helpers; read `salin-web-handoff/DESIGN.md` first)

**SimpleToday** (mobile first, one column, max-width like Today):
1. Greeting line (existing `Greeting`, shortened) + a small streak chip ("🔥" is not allowed; use the icon set: "5 days").
2. **Hero:** *₱X left today* (count-up), under it "₱Y left this week · N days until {Sun, Oct 18}" where the until part is a button that opens a small sheet (End of this week · Pick a date). Coral variant when negative.
3. **Week strip:** 7 compact day columns with a bar each (past = spent, today = ring, future = pace). Tap → drawer with that day's spending.
4. **Two primary actions, side by side:** **I got money** (opens ReceiveMoney) and **Log spending** (existing sheet, amount-first). Below them a quiet text action **No spend today** (toggles, undoable, confetti-free tiny acknowledgement).
5. **Where your money is:** account rows with balance and a pending-moves line.
6. Link at the bottom: "Switch to full view".

**ReceiveMoney** (one sheet, one screen, one Save button; no wizard):
- Big `MoneyInput` for the amount (focused on open).
- Source chips (remembered; last used preselected; "Other" fallback). Date defaults to today, changeable.
- **Where it goes:** one row per account with a typed amount. First row = **Received in** (chip to change, defaults to last used) and holds the remainder automatically, so the rows always add up. Quick chips: "All in {account}". Editing any other row reduces the received-in row. Never allow a total ≠ amount (Save disabled with a one-line reason).
- **Keep aside** (optional): a single amount field, default ₱0 (remembered per user). A live line: "₱{amount − keep} is yours to spend. Lasts until {date}: about ₱{pace} a day." This is the motivating moment: the user sees the effect before saving.
- Save → writes via `receive_money` (spending lines per account + one keep line to the keep bucket in the received-in account). Success state: the hero number count-up grows (`/today?grow=confirm`), and if any line needs a move, a card "Move ₱500 from MariBank to Cash" with a tick button appears under the hero (reuses the transfer tick RPC; a P0001 "already sent" counts as ticked).

Empty and error states: no accounts → "Add an account first" with a link to Plans → Accounts (inline add is a follow-up). A failed Save keeps every field. Reduced-motion respected. 44px targets, visible focus, AA contrast in light and dark. 390px and desktop viewport e2e.

## Tests the agents must leave green

lint, typecheck, `npm test`, build, `npm run db:reset && npm run db:test`, `npm run test:parity`, `npm run test:mobile-compat` (set `SALIN_MOBILE_PATH=/Volumes/RolfStuffs/Developer/salin-v2` in a worktree). New Playwright specs: receive money (split over 2 accounts + keep) → hero shows the right number and a move row appears → tick it; no-spend streak; change "until" date changes the per-day number; Full-view toggle round trip; 390px viewport. Existing e2e must pass untouched.
