# Business rules: the money math

Every rule here is testable. Implement the shared rules in Postgres (so mobile and web agree) and mirror them in `lib/money` only for previews. All amounts are integer **centavos**; `₱17,329.00` is `1732900`.

## 1. Concepts

| Term | Meaning |
|---|---|
| **Bucket** | A purpose for money (Living, Fun, Emergency fund, …). Has a group (Spend, Save & grow, Set aside), a hue, and the account it is **kept in**. |
| **Account** | Where money physically sits (MariBank, GCash, Pag-IBIG MP2, AUD account, …). |
| **Income source** | Where money comes from (Work, DOST stipend, Logo commissions, …). Has a kind, a rule and the account it usually **lands in**. |
| **Income** | One inflow (a `ledger_entries` row, direction inflow) waiting for, or given, a job. |
| **Job** | How an income is allocated: `plan`, `own` (source's own split), `whole` (one bucket), `one` (one-off: all to a bucket chosen now). |
| **Allocation** | The confirmed result: per-bucket amounts, the plan used, and each bucket's destination account at that moment. |
| **Left** | What's left in a bucket: allocations in − spending out ± covers. |

## 2. Allocation engine

### 2.1 Which job an income gets

1. If the user picked a job for this income, use it.
2. Otherwise use the source's rule: `plan` → `plan`, `own` → `own`, `whole` → `whole`.
3. If the rule is `ask`, the income has **no job** and shows "Needs a job".
4. If the rule is `own` and the source's percentages don't total **exactly 100**, the income has **no job** ("Its split adds to 90%, fix it in Plans"). Never rescale.
5. An income with no job is never confirmed by "Confirm all". The Today preview may show it as if split by the active plan, and must say so.

### 2.2 `plan` job

1. **Active plan:** Plan A until the Emergency fund reaches the switch target (₱50,000 by default), then Plan B. Evaluate **at confirm time, before this income is added**. When several incomes are confirmed together, evaluate each in order (the first can switch the plan for the next).
   - Measure: the prototype uses the Emergency fund's current **left** amount. The owner's sheet uses the **sum of past Emergency allocations** (ignores withdrawals). This is an open decision (DECISIONS.md D-14); implement behind one function so it's a one-line change.
2. **Rent redirect:** if the income's date is before the rent start date (Jan 1, 2027), Rent gets 0% and its percentage is added to the Emergency fund. On or after the start date, Rent gets its own percentage. (The prototype always redirects, because all its sample income is from 2026; the date check is the real rule.)
3. Planless buckets (Scholarship) get 0% from a plan.
4. Compute each bucket's share as `round(amount × pct / 100)` (round half up on centavos), then apply the remainder rule.

### 2.3 `own` job

Use the source's percentages (must total 100). Buckets at 0% get nothing. Same rounding; the remainder goes to the bucket with the largest percentage (first in bucket order on a tie).

### 2.4 Remainder rule

After rounding, `remainder = amount − sum(shares)` (can be negative). For `plan`, add it to the **Emergency fund**; if the plan gives the Emergency fund 0% (after any redirect), add it to the largest share instead (first in bucket order on a tie). For `own`, add it to the largest-percentage bucket. Result: shares always sum exactly to the amount.

### 2.5 `whole` and `one` jobs

100% to one bucket (`whole` uses the source's bucket; `one` uses the bucket the user picked, defaulting to Emergency fund). Rent cannot be picked for `one`.

### 2.6 Snapshots

On confirm, store with the allocation: the plan key and the percentages actually used, the rule that produced them (for "why" text), and for every bucket its **destination account at that moment**. Later changes to the plan, rules or "kept in" accounts never touch confirmed allocations.

## 3. Transfers (the checklist)

1. For each confirmed allocation line, `from` = the account the income **landed in**, `to` = the line's snapshotted destination account.
2. `from === to` → no transfer; show it as "Keep ₱X in {account} · already there".
3. Group the rest by `(from, to)` and sum.
4. **Netting:** if money flows both ways between two accounts (A→B and B→A), subtract the smaller from both. Each side then **keeps** the netted amount: A keeps it for B→A's buckets, B keeps it for A→B's buckets. Show it on the keep rows ("includes ₱350.00 kept by netting") and on the surviving transfer ("₱350.00 less: that much stays put on the other side").
5. **Never net over a sent transfer.** If either direction was already ticked as sent at a different amount than the netted result would be, don't net that pair.
6. Ticking a transfer stores `sentMinor = amount` and records a real transfer the way mobile does: one `transfers` row plus two `ledger_entries` (`{id}_out` outflow from `from`, `{id}_in` inflow to `to`, `origin = transfer`). Unticking soft-deletes them.
7. A transfer counts as done only if `sentMinor === current amount`. If the amount grew (new income), show "Send ₱(amount − sent) more · ₱sent already sent".
8. "All money in has a home" when no income is waiting, at least one was confirmed, and every transfer is done.

## 4. Spending and buckets

1. A spending entry belongs to the bucket its category mapped to **when it was logged**. Store that bucket on the entry (DATA_MODEL.md `entry_buckets`). Moving a category later doesn't move old entries.
2. `left(bucket) = Σ allocations − Σ spending + Σ covers in − Σ covers out`.
3. **Overspent:** `left < 0` → coral "Needs ₱X". Offer "Cover from Buffer": move `min(deficit, left(Buffer))` from Buffer to the bucket as a cover record. If Buffer can't cover all of it, say how much is still needed and let the user pick another bucket. Never move money automatically.
4. **Safe to spend** = `Σ left` over the Spend group (Living + Fun by default). It may be negative and is shown as is. **Per day** = `floor(safe / days until next payday)`, never below 0 in the "a day" figure.
5. **Days until next payday:** from the Work source's expected cadence or the user's "next payday" setting (open decision D-15). The prototype hard-codes Oct 21 as sample data.

## 5. Accounts

1. **Should hold** (per PHP account) = Σ allocation lines whose snapshotted destination is this account + Σ (covers in − covers out − spending) for buckets currently kept here. Label it "should be here, by your buckets"; if no bucket is kept here but money arrived earlier, "from earlier paydays, no bucket is kept here now".
2. AUD accounts show A$ retained (received − transferred out), from income records.
3. **Archive** only when nothing uses the account: no bucket kept here, no source lands here, no waiting income landed here, no open transfer touches it, and it holds no money. Otherwise show "In use" with the first reason.
4. Accounts are referenced by **id**, so renaming never rewrites references (the prototype uses names; don't copy that).
5. Account types use the mobile `AccountType` enum (DATA_MODEL.md §1.3).

## 6. Categories

1. Each expense category belongs to exactly one bucket (`category_buckets`).
2. Moving a category changes where **new** spending goes. The old bucket keeps its entries and shows a line: "₱150.00 from Load & data (now in Fun money), logged before the move".
3. Remove a category only if it has no entries; otherwise offer Move.
4. Income categories identify income sources: a mobile inflow with that category is recognised as that source.

## 7. Goals and milestones

1. Goal progress = saved ÷ target, capped at 100%. Emergency fund saved = its left amount; PC Build = 50% of Sinking funds' allocations (owner's sheet); others start at 0 until linked.
2. The Emergency fund target **is** the Plan B switch amount (one value, edited in either place).
3. Milestones at 25 / 50 / 75 / 100%. A milestone is "passed" when a confirm moves progress from below to at-or-above it. Show "Passed 25% today" only for milestones crossed in that session/day.
4. "About N more paydays like {date}" = `ceil((target − saved) ÷ last Work payday's Emergency share)`. Hide it if there's no Work payday yet.

## 8. Week loop and review

1. Steps: last payday split (done only if a real confirmed Work payday exists this week; this is the endowed step) · All money in has a job · Transfers made · Living above zero · Week closed.
2. Closing is allowed with open items; they carry into next week. Store the week close with its check results.
3. The week slip must reconcile: `Came in = Spent + Put away + Tax set aside + Cushions & kept whole + To assign + Safe to spend`, where Put away = Σ left of the Save & grow group, Tax set aside = left of Tax, Cushions & kept whole = left of Buffer + Scholarship + Rent, and Safe to spend = left of the Spend group. Using **left** (not allocations) keeps it true when money is spent from a set-aside, e.g. a BIR payment from Tax; covers net to zero. "Came in" lists each source. (The prototype uses allocations for Put away and Tax, which only works because its sample data has no spending there.)

## 9. Validation

- Amount received: required, > 0, ≤ ₱10,000,000.00; accept `17,410`, `17410.5`, `₱17,410`.
- A$ sent (optional, salary sources): if present must be > 0; show "Rate you got: ₱(pesos ÷ A$) per A$1" to 2 dp, computed in integers, round half up.
- Plan percentages: integers 0–100; each plan must total 100 to save.
- Own split percentages: integers 0–100; must total 100 to be usable.
- Names: 1–60 characters, trimmed, unique per user for accounts.

## 10. Golden tests (from the owner's sheet; must pass byte for byte)

| # | Input | Expected (centavos) |
|---|---|---|
| G1 | ₱17,329.00 (1732900), Plan A, dated Oct 7 2026 | tax 103974 · living 121303 · rent 0 · emergency 554528 · invest 519870 · sinking 173290 · fun 173290 · buffer 86645 (sum 1732900) |
| G2 | ₱23,000.00 (2300000), Plan A, Oct 8 2026 | tax 138000 · living 161000 · rent 0 · emergency 736000 · invest 690000 · sinking 230000 · fun 230000 · buffer 115000 |
| G3 | 1000001, Plan A, before 2027 | tax 60000 · living 70000 · emergency 320001 (gets the +1 remainder) · invest 300000 · sinking 100000 · fun 100000 · buffer 50000 |
| G4 | 333, Plan A, before 2027 | tax 20 · living 23 · emergency 107 · invest 100 · sinking 33 · fun 33 · buffer 17 (sum 333) |
| G5 | ₱3,500.00 own split Tax 10 / Sinking 40 / Fun 50 | tax 35000 · sinking 140000 · fun 175000 |
| G6 | Own split Tax 10 / Sinking 40 / Fun 40 | No job ("Its split adds to 90%"); not confirmable |
| G7 | Confirm G2 (Others source, given the plan job; landed MariBank), G5 (landed GCash or Maya), ₱1,500 allowance whole→Living (landed GCash / cash), all in one go | Keep MariBank 1024000 (incl. 35000 netted) · keep GCash or Maya 210000 (incl. 35000 netted) · keep GCash / cash 150000 · send MariBank→GCash / cash 161000 · MariBank→Pag-IBIG MP2 690000 · MariBank→Tonik 230000 · MariBank→GCash or Maya 195000 (netted 35000) · GCash or Maya→Tonik 140000 |
| G8 | As G7 but confirm G2 first, tick MariBank→GCash or Maya (230000) as sent, then confirm the rest | No netting: MariBank→GCash or Maya stays 230000 sent; new GCash or Maya→MariBank 35000 appears |
| G9 | Starting state of the prototype (Oct 7 split + sample spending Living 130000, Fun 130050) | Living left −8697 ("Needs ₱86.97") · Fun 43240 · safe to spend 34543 · per day over 10 days 3454 |
| G10 | Emergency at 554528, then G2 confirmed | Emergency 1290528 = 25.8% of 5000000 → "Passed 25% today"; "About 7 more paydays like Oct 7" |
| G11 | A$400 sent, ₱17,410 received | Rate ₱43.53 per A$1 (integer math: 1741000 × 100 ÷ 40000 = 4352.5 → half up → 4353). The prototype shows 43.52 because it uses float `toFixed`; don't copy that. |
| G12 | Move "Kept in" for Investments to Tonik after G7 is confirmed and one transfer ticked | Transfer list unchanged; Pag-IBIG MP2 still "should hold" its earlier share |

Keep G9 and G12 as e2e tests; the rest as unit tests on the SQL functions (pgTAP) and their TS mirrors (Vitest).

## 11. Logging spending on the web

1. A logged expense is an outflow `ledger_entries` row (`origin = manual`) on the account it was paid from, with its category. The bucket comes from the category at that moment (§4.1).
2. Amount > 0 and ≤ ₱10,000,000.00, category required, date ≤ today.
3. The impact line and the Logged flag use the same formulas as Today: `left(bucket) − amount`, and for Spend buckets `floor((safe − amount) / days until next payday)`.
4. Spending synced from the phone before onboarding finished counts in every balance (it's real), but doesn't tick "First spending logged" (§12.6): that step looks only at expenses created after `user_profiles.onboardedAt`.

## 12. Onboarding rules

### 12.1 Suggested plan

Inputs: main income amount per pay `A`, frequency `f` (monthly ×1, twice a month ×2, every 2 weeks ×26/12, weekly ×52/12, varies ×1), monthly income `M = round(A × f)`, monthly fixed bills `B` (0 if none), priority, kind (salary / side hustle / scholarship / allowance), paid in another currency (yes/no).

1. **Bills first:** `billsPct = B > 0 ? min(45, ceil(B × 100 / M)) : 0`. Bills bucket (the Rent bucket, renamed to the one bill kind picked, else "Bills") = `billsPct`.
2. **Then Living:** suggested and 50/30/20 presets: `max(10, 50 − billsPct)`; Simple preset: `max(10, 60 − billsPct)`.
3. **Then the priority profile** (suggested preset) or the preset's fixed shares:

| | Fun | Emergency | Investments | Sinking |
|---|---|---|---|---|
| Build a safety net | 10 | 25 | 5 | 10 |
| Save for something | 10 | 10 | 5 | 25 |
| Grow it for later | 10 | 10 | 25 | 5 |
| Keep spending in check | 20 | 15 | 5 | 10 |
| 50/30/20 preset | 30 | 10 | 5 | 5 |
| Simple preset | 20 | 20 | 0 | 0 |

4. **Set-asides:** Tax 6% if the main income is a side hustle or paid in another currency; Buffer 3% if paid in another currency, else 5% if the pay varies, else 0.
5. **Trim to exactly 100** by taking, in order, from: Fun (down to 5), Sinking (to 5), Investments (to 0), Emergency (to 5), Living (to 10), then Fun, Sinking, Emergency to 0. If the total is under 100, add the gap to Emergency.
6. **Plan B** is offered only if Emergency ≥ 10%: Plan B = Plan A with Emergency 5% and the difference added to Investments. On by default when offered.
7. Percentages are whole numbers. The user can change any share; Continue needs exactly 100.

### 12.2 Safety-net target

`target = ceil(3 × round(M × (Living% + Bills%) / 100) / ₱1,000) × ₱1,000`, minimum ₱1,000. It's the Plan B switch amount and the Emergency fund goal (one value).

### 12.3 Where each bucket lives (suggestion)

Over the user's PHP accounts, with `L` = the account pay lands in:

| Bucket | Suggested home |
|---|---|
| Living | first e-wallet, else Cash, else L |
| Fun | second e-wallet, else the first e-wallet, else Cash, else L |
| Bills, Tax, Buffer, Scholarship | L |
| Emergency fund | first savings account that isn't L, else another bank, else L |
| Sinking funds | second savings account, else Emergency's account rule, else L |
| Investments | first investment account, else a savings account, else another bank, else L |

Transfers each payday = number of distinct homes ≠ L among buckets with a share. Show it live.

### 12.4 Income found on the phone (app path)

1. Group inflow `ledger_entries` (not transfers) from the last 90 days by income category; each group is a source named after its category, landing in the account most of its entries landed in.
2. Cadence from the median gap between the last three entries: 6–8 days weekly, 13–16 every 2 weeks or twice a month (twice a month if entries fall near the same two days of the month), 28–31 monthly, else "it varies". One entry: "once".
3. Main pay defaults to the source with the most entries in 60 days (ties: larger total). Its latest amount is the plan's `A`.
4. Next payday = latest entry + median gap, moved forward to today or later; editable.
5. Kind is guessed from the category name (salary / stipend or scholarship / allowance / other); the rule follows the kind's default; "other" defaults to ask.
6. Income this month without allocations goes to Money in at finish; the main pay is excluded only if it was split during onboarding.

### 12.5 Category auto-mapping

Match the category name (case-insensitive) in this order; if the matched bucket has no share in the plan, or nothing matches, put it in Living and mark it **not sure** (the user checks those first):

| Bucket | Name contains |
|---|---|
| Living | grocer, food, lunch, meal, transport, commute, fare, load, data, laundry, utilit, electric, water, medicine, pharm |
| Bills | rent, tuition, dorm, internet, wifi |
| Fun | movie, going out, eating out, shopping, coffee, game, hobb, treat, dining |
| Sinking funds | school, gadget, health, gift, travel |
| Tax | tax, bir |
| Buffer | fee, fx, exchange |

Store whether a mapping is automatic or set by the user (`category_buckets.source`). Later plan changes may move automatic ones; never user-set ones.

### 12.6 Getting started (first week)

Replaces the week loop until the first week is closed:

- With a plan: Plan set up ✓ · First pay has a job (any allocation exists) · Transfers made (a payday exists and nothing is pending) · First spending logged (an expense entered after onboarding, on web or phone) · First week closed.
- Just tracking: Income and accounts set up ✓ · Make a plan · First pay recorded · First spending logged · First week closed.
- Waiting income always takes the next-step card first, then the first unfinished step.

### 12.7 Just track

Plan A = Spending (the Living bucket, renamed) 100%, Plan B off, every bucket kept in L, all categories mapped to Spending (automatic), no goals. A later **Make a plan** applies a new plan to future paydays only (never re-splits confirmed income), moves only automatic category mappings, keeps goals and adds the Emergency fund goal.

### 12.8 Onboarding golden tests

| # | Input | Expected |
|---|---|---|
| O1 | Salary ₱25,000 twice a month, PHP, safety net, bills ₱6,000 now (Rent) | Living 38 · Rent 12 · Fun 10 · Emergency 25 · Investments 5 · Sinking 10. Split of 2500000: 950000 / 300000 / 250000 / 625000 / 125000 / 250000. Target ₱75,000. Plan B: Emergency 5, Investments 25 |
| O2 | Salary ₱17,329 every 2 weeks, paid in AUD, safety net, bills ₱2,000 starting Jan 1 2027 | Living 44 · Rent 6 · Fun 5 · Emergency 25 · Investments 5 · Sinking 6 · Tax 6 · Buffer 3. Split of 1732900 before 2027: living 762476 · rent 0 · fun 86645 · emergency 537199 · invest 86645 · sinking 103974 · tax 103974 · buffer 51987. Target ₱57,000 |
| O3 | ₱30,000 monthly, keep spending in check, bills ₱20,000 | Rent 45 (capped) · Living 10 · Fun 15 · Emergency 15 · Investments 5 · Sinking 10; bills warning shown (₱13,500 < ₱20,000) |
| O4 | Side hustle ₱15,000, it varies, save for something | Living 50 · Fun 5 · Emergency 10 · Investments 5 · Sinking 19 · Tax 6 · Buffer 5; Plan B offered (Emergency 5, Investments 10) |
| O5 | Any input, Skip | Spending 100; no transfers; no goals |
| O6 | O1 accounts GCash, BPI (landing), Maya, Tonik, Pag-IBIG MP2 | Living GCash · Fun Maya · Rent BPI · Emergency Tonik · Sinking Tonik · Investments Pag-IBIG MP2 → 4 transfers |

