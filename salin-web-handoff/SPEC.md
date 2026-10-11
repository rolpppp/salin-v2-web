# Spec: screens, flows, acceptance criteria

The prototype ([`prototype/index.html`](prototype/index.html)) is the reference for layout, copy and motion. This file says what must be true. Money rules are in BUSINESS_RULES.md (cited as **BR §n**); visual rules in DESIGN.md.

Where the prototype shows **Sample** data or hard-coded dates (Oct 11, Oct 21, "Rolf"), the real app uses the signed-in user's data and today's date.

## 0. App shell

- **Header:** logo, four tabs (Today · Money in · Review · Plans), theme toggle (light / dark, follows system until changed), avatar menu (account, sign out).
- **Tab badges:** Money in shows a coral dot + count when income is waiting ("needs attention"); Review shows a dot on the review day if the week isn't closed ("due"). No other badges.
- **Routes:** `/welcome/[step]` (onboarding), `/today`, `/money-in`, `/review`, `/plans/[split|income|accounts|categories|goals]`. Deep links work; back/forward work. A signed-in user who hasn't finished onboarding is sent to `/welcome` and resumes at their last step.
- **Live region:** one polite `aria-live` region announces results of actions ("Logo commissions confirmed", "MariBank archived").
- **Auth:** Supabase Auth, same accounts as mobile. Signed-out users see sign-in only.

### First run

Every new user goes through onboarding (§7) before Today. It ends with a plan built from their own numbers and, ideally, their first pay given a job. Never show sample numbers as the user's own.

## 1. Today

Purpose: answer "how am I doing and what's next?" in five seconds.

| Block | Content | Acceptance |
|---|---|---|
| Greeting | "Good evening, {first name}", date, "{n} days until payday", **+ Log spending** and **+ Add income** (soft buttons) | Greeting follows local time of day. Log spending opens the sheet (§8). Add income opens the form on Money in with focus in Amount. |
| Safe to spend | Big number (BR §4.4), "Living and Fun money, until your next payday", day strip ending in Pay, "About ₱X a day for N days", leaders "Put away in {month}" and "Set aside for tax" | Negative values show with `−` in coral. Per-day never below ₱0. |
| Next step card | One message + one primary action, chosen by the first unfinished week step (BR §8): waiting income → "Give it/them a job"; open transfers → "Make transfers"; Living below zero → "Cover from Buffer" + "See what happened"; else → "Start review". All done → "Every peso has a job this week." + next review and payday dates | Exactly one primary button. Shows source chips when income waits. Mentions incomes that still need a job by name. |
| This week | "{done} of 5 done", progress bar, five steps with checks | Step 1 is the endowed step and only ticks for a real payday (BR §8.1). In the first week after onboarding it reads **Getting started** instead (BR §12.6). |
| Your buckets (shelf) | Three groups (Spend / Save & grow / Set aside), one ribbon per bucket, height ∝ left, amount, name. Waiting income shows as dashed "+₱X" previews on each bucket it would feed. Footer: scale note and total in all buckets | Ribbons to scale; scale grows in ₱2,000 steps so nothing is cut off. Overspent bucket shows coral "Needs ₱X" and no ribbon. Rent shows "Starts Jan 2027" while 0. Clicking a bucket opens the drawer. If an income has no job, the legend says it's previewed as Plan {active}. |
| Goals | Up to three: Emergency fund first (wider), then others; bar with 25/50/75 ticks, % saved, "₱X to go", "About N more paydays like {date}" (BR §7.4), "Passed 25% today" chip | Chip only when a milestone was crossed today. Link to more goals in Plans. With no goals (just tracking): one line inviting a goal. |
| Shelf visibility | Only buckets that are on show: a plan share > 0, a source keeps money there, or it holds or spent money. Groups with no visible bucket are hidden. The "Set aside" hint names what's actually there ("bills, cushions & scholarship"). | |
| Cover flag | After a cover: "Covered. Buffer topped up Living by ₱X." | |
| Logged flag | After logging spending on the web: "Logged ₱180.00 for Lunch. Living has ₱9,320.00 left. Safe to spend: about ₱3,018 a day." | Clears when the user leaves Today. |

**After a confirm** (returning from Money in): ribbons grow from old to new values into their dashed previews while amounts count up; goal bars fill and any crossed tick lights. Plays once; reduced motion shows the end state.

### Bucket drawer

Opens from the right (bottom sheet under 720px). Shows account it's kept in, name, "Left" amount, note, its plan percentages (Rent: "Until Jan 2027 this share goes to the Emergency fund"; Scholarship: "Not part of the payday split"), and a slip of lines this month: paydays in (green +), spending out, covers. Living overspent → "Cover ₱X from Buffer" primary. Focus moves to Close; Escape closes; focus returns to the bucket.

## 2. Money in

Purpose: give every incoming peso a job, then make the real transfers.

### 2.1 Header

Title by state: "Give your money a job" (income waiting) · "Move the money" (only transfers left) · "Every peso has a home" (all done) · "Nothing waiting" (empty, with "Money from any source shows up here: salary, scholarship, side hustle, allowance."). **+ Add income** soft button unless the form is open.

### 2.2 Add income form

Fields: **Source** (select), **Amount received** (₱), **Date** (default today, max today), **Landed in** (defaults to the source's account), and for salary sources **Sent from AUD** (A$, optional) with live "Rate you got: ₱X per A$1". Under the fields: "Its job: {rule}" or "You'll pick its job after adding it", with a link to change rules in Plans. Subtitle: "Logged on your phone? It shows up here by itself."

- Submit **Add to Money in** creates an inflow `ledger_entries` row (`origin = manual`, category = the source's income category) and an `income_meta` row; the new income appears in the queue, selected, with focus on its row.
- Errors (inline, `role="alert"`, focus returns to the field): "Enter the amount you received, above ₱0." · "That amount looks too large. Check the number of zeros." · "The A$ amount isn't a number. Fix it or leave it empty."
- Changing Source resets Landed in to that source's account.
- While the form is open it owns the primary button; Confirm becomes soft.
- Cancel clears the draft and returns focus to + Add income.

### 2.3 Step 1: Choose each one's job

- Queue of waiting incomes (oldest first). Each row: source name, kind chip (hidden if the name already says it), amount, "{date} · landed in {account}", A$ and rate if known, and the job ("Split by Plan A", "Own split: Tax 10 · Sinking 40 · Fun 50", "Kept whole in Scholarship"), or coral **Needs a job** / "Its split adds to 90%, fix it in Plans".
- Selecting a row expands it: job options as radio cards (Use its rule · Split by my plan · One-off: all to one bucket [bucket select]), a "Where it goes" bar list, and **Confirm just this one**. Only one row open at a time; clicking the open row collapses it (slip then shows the total).
- **Confirm all N · ₱X** (primary) confirms every income that has a job, in date order (BR §2.2.1). Disabled when none has a job. Helper text names those that still need one.
- Confirmed incomes move to a done list (check, name, how, amount) under the queue; "{done} of {total} done".
- Focus after confirm: next waiting row if any, else the first transfer checkbox, else the completion card's button.

### 2.4 Step 2: Move the money

- Disabled ("Transfers appear here, grouped by account, once you confirm.") until something is confirmed.
- **Keep rows** first (no checkbox): "Keep ₱X in {account}" with bucket names, "already there", netting note.
- **Transfer rows** (checkbox): "Send ₱X to {account}", bucket names, "from {account}", netting note, partial "Send ₱X more · ₱Y already sent". Checked rows show a "Sent" stamp. "{sent} of {total} sent".
- Ticking writes the transfer immediately (BR §3.6); unticking reverses it. Keyboard: Space toggles.
- When everything is sent and nothing waits: the step is replaced by the **completion card** "All money in has a home." listing "₱X from N sources now has a job", "Your accounts match your buckets", "Living is back above zero" (only if it was below), "Emergency fund passed 25% of ₱50,000" (only if crossed), and **See your buckets grow** → Today with the grow animation. Sun-tinted burst once.

### 2.5 Slip (right column; below the steps on small screens)

A receipt for the selected income: source, date, landed in, lines per bucket, total, "why" text (plan used and rules applied, e.g. "Rent's 2% went to Emergency until Jan 2027"). With nothing selected it shows all waiting income combined. "ALL IN" stamp appears when everything is done.

## 3. Review (weekly)

Purpose: five minutes, once a week: look back, fix one thing, close.

- Header "Week of {start} – {end}" (week start from user setting), subtitle, stepper: Look back ✓ · Fix one thing · Close the week.
- **Week slip** (receipt): Came in (with one sub-line per source) · Spent · Put away · Tax set aside · Cushions & kept whole · To assign · total **Safe to spend**. Must reconcile (BR §8.3). Footer compares with last week ("₱X more put away than last week"); first week says there's nothing to compare yet. "WEEK CLOSED" stamp when closed.
- **Where your spending went:** bars per Spend bucket with what each had; note when nothing came from savings.
- **One thing to look at:** a single, specific, honest observation, picked by priority: (1) a Spend bucket is overspent → name the biggest category and offer **Cover from Buffer** and **Move 1% from Fun to Living** (future paydays only; which plans it changes is DECISIONS.md D-18; confirm via the live region); (2) covered this week → suggest raising Living; (3) nothing wrong → a positive fact (e.g. most put away in a month). Never more than one.
- **Progress this week:** change in the Emergency fund **this week** (not total), bar, "N% of the ₱50,000 that switches you to Plan B".
- **Close the week:** three checks (Every peso has a job · Transfers made · Living above zero), **Close the week** primary, "You can close with open items. They carry into next week." Closing stores a `week_reviews` row and shows "Week closed. Monday starts fresh." with the checks (open ones marked "carries into next week"), "You start next week with ₱X safe to spend" and the next review date. Burst once.
- A closed week can't be reopened in v1 (reviews are records).

## 4. Plans

Segmented control: Split plan · Income · Accounts · Categories · Goals. Every edit saves on change (no Save button) unless noted, and announces what changed and from when.

### 4.1 Split plan

- Table: bucket (hue dot), **Kept in** (account select), **Plan A %**, **Plan B %**, what it's for. Footer totals; a total ≠ 100 shows coral and the message "Plan A adds up to 95%. Add 5% to another bucket." A plan that doesn't total 100 isn't saved (the last valid version stays active); show that clearly.
- Chip "Plan {A|B} is active".
- Planless buckets (Scholarship) listed below the table with their Kept in select.
- **Rules card:** Switch to Plan B at ₱[amount] (editable; same value as the Emergency goal target) with "Now ₱X"; rent redirect until {date} (date and monthly rent editable in v1.1); "Changing a percentage or where a bucket is kept only affects paydays after the change."
- On mobile the Kept in select moves under the bucket name.

### 4.2 Income

- One row per source: name (editable for new ones), kind chip, "lands in" select, **rule** select (Split by my plan · Its own split · Keep it whole [bucket select] · Ask me each time), and a one-line description of what the rule does.
- **Own split editor:** a % field per bucket (Rent excluded), 0 = skipped (dimmed), live total "90% · needs 100%" in coral or "100%" in teal. An incomplete split never rescales; incomes from that source need a job (BR §2.1.4).
- **+ Add income source** → preset chips (Salary, Scholarship, Side hustle, Allowance, Gift, Refund, Other). Each creates a source with that kind's default rule (salary → plan; scholarship → whole Scholarship; side → own Tax 10 / Sinking 40 / Fun 50; allowance → whole Living; gift, refund, other → ask) and focuses its name field. Creating a source also creates its income category so mobile entries can be tagged with it.
- Remove only for sources with no income; otherwise archive.
- Footnote: rule changes apply to money that hasn't been given a job yet.

### 4.3 Accounts

- One row per account: name (inline rename), type select (mobile `AccountType`), currency chip, **should hold** (BR §5.1) or A$ retained, buckets kept here and sources landing here as chips, **Archive** or "In use · {reason}" (BR §5.3).
- **+ Add account** form: Name, Type, Currency (PHP, AUD, USD) → "Add account". Errors: empty name, duplicate name.
- Archived accounts listed with **Restore**.
- Accounts are the same rows mobile uses; creating one here appears on mobile after sync.

### 4.4 Categories

- Grouped by bucket (in shelf order; Rent only if it has categories). Group header shows "₱X spent in {month}".
- Row: name (inline rename), this-month total + entry count, **Move to {bucket}** select, **Remove** (only if no entries; otherwise "Has entries").
- After a move, the old bucket shows the "logged before the move" line (BR §6.2).
- Inline "New category" + Add per bucket (creates an expense `categories` row + `category_buckets` row).
- Note at the top: moving changes where **new** spending goes.

### 4.5 Goals

- Row: name, where it's fed from, bar, "₱X saved of ₱Y", editable target. Emergency target edits the Plan B switch too.
- v1: add, rename, retarget and archive goals; link a goal to a bucket (all of it or a share, e.g. PC Build = 50% of Sinking).

## 5. Responsive and accessibility

- Breakpoints 1100 / 860 / 720 (DESIGN.md). Under 860 the slip moves below the steps; under 720 the shelf scrolls horizontally inside its card (page never scrolls sideways), tabs stay in the header, drawer becomes a bottom sheet.
- Mobile order on Money in: Add income form → Step 1 → Step 2 → slip.
- All controls keyboard reachable with visible focus; radio groups use arrow keys; drawer traps focus.
- Every re-render keeps or moves focus deliberately (sections above say where). Never drop focus to `<body>`.
- Reduced motion: no ribbon growth, count-ups or bursts; state changes are instant and still announced.
- Colour is never the only signal: overspent says "Needs", sent says "Sent", totals say "needs 100%".

## 6. Empty, loading and error states

| Situation | Show |
|---|---|
| No income ever | Money in: "Nothing waiting" + Add income |
| No spending this week | Review: "Nothing logged this week. Log spending on your phone and it shows here." |
| No goals | Goals: one line and "Add a goal" |
| Mobile sync off | Banner on Today: "Spending from your phone shows here when sync is on in the Salin app." |
| Loading | Skeletons shaped like the final blocks; never spinners over money |
| Write failed | Inline message at the control ("Couldn't save. Check your connection and try again.") and the previous value restored. Never show a success state for a failed write. |

## 7. Onboarding (first run)

Purpose: in about three minutes, get every user from "signed up" to "my pay has a plan and I know what to move where", and give them a real first win. Mechanisms (see PRODUCT.md): one question per screen, smart defaults the user can change, the plan built from their own numbers (ownership), a plan slip that fills as they answer (open loops closing), and a finish on real money (peak).

### 7.1 Welcome (`/welcome`)

- Headline "Let's give every peso a job.", one paragraph (three minutes, built from your numbers, Salin never moves money), three benefit lines, and the question **"Have you used the Salin app on your phone?"** with two cards: **I'm new to Salin** (web path) and **I use the Salin app** (app path).
- Decorative example shelf ("Example payday ₱25,000", labelled as an example), hidden from assistive tech.
- **Auto-detect:** if the signed-in account already has synced mobile rows (any `accounts` or `ledger_entries` for this user), skip the question and start the app path at "Found your Salin data". If not, show the question.

### 7.2 Shared shell

- Top rail: "Signed in" pre-ticked (endowed step), then one pill per step; the current one is highlighted with its label, done ones show a check. Under 1100px only the current pill shows its label; under 720px "Signed in" is hidden.
- Left: the step card. Header = kicker ("Step 2 of 6 · Accounts"), question as `h1` (receives focus on every step change), one-sentence reason.
- Right (below the card under 860px): the **plan slip**, a receipt that prints a line for each answer (For, Comes in, How often, Next payday, Accounts, Lands in, First, then the split lines with % and ₱, Total, On payday: N transfers). Unanswered lines show "· · ·". A line prints with a short highlight the first time it fills. Footer: "Fills in as you answer. Nothing is saved until you finish." At the end it stamps **PLAN SET**.
- Footer of each card: **Back** (quiet, left) and one primary (right). The primary is a submit, so Enter continues. Errors appear above the buttons (`role="alert"`), focus goes to the field at fault.
- Drafts autosave to `user_profiles.onboardingDraft` (DATA_MODEL.md) so a user can leave and resume on any device; nothing is written to plan tables until Finish.

### 7.3 Web path (6 steps)

| Step | Asks | Acceptance |
|---|---|---|
| 1 Income | First name; main income kind (Salary · Freelance or side hustle · Scholarship · Allowance); about how much each time (₱, what lands after deductions); next payday (date, today or later, no default); how often (Monthly · Twice a month · Every 2 weeks · Weekly · It varies); "I'm paid in another currency" toggle; other money (Side hustle · Scholarship · Allowance · Gifts) | Name required (1–40). Amount > 0 and ≤ ₱10,000,000. Next payday required. Each "other money" chip becomes a source with its kind's default rule (BR §2, SPEC §4.2). |
| 2 Accounts | Chips for common PH accounts (GCash, Maya, BPI, BDO, Metrobank, UnionBank, MariBank, Tonik, GoTyme, CIMB, Pag-IBIG MP2, Cash) plus "Another account" + Add; "Your pay lands in" select | At least one account and a landing account. Deselecting the landing account clears it. Copy: "No bank login: Salin only needs the names." |
| 3 Priorities | One of: Build a safety net · Save for something (+ name and cost) · Grow it for later · Keep spending in check; fixed bills each month (₱, optional) with kind chips (Rent, Tuition, Utilities, Internet, Loan); if bills > 0, "These start later" toggle + start date | Priority required; goal name and cost required for "Save for something". **Skip the plan, just track for now** (quiet) → §7.6. |
| 4 Your plan | "Here's a plan for your ₱25,000 pay" + why line; preset control (Suggested for you · 50/30/20 · Simple); stacked bar; one row per bucket with purpose line, − % + stepper (and typed %), ₱ per pay, ≈ ₱ a month (or "to Emergency until {date}" for bills that start later); "Add a bucket" for hidden ones; total status; reality checks; Plan B switch + safety-net target | Suggestion per BR §12.1. Continue disabled until the total is exactly 100 ("95% · 5% still needs a job" in coral). Edits survive Back/Continue unless the answers they came from change; switching preset replaces them and says so. Reality checks: bills larger than their share (coral), and in the app path Living/Fun monthly share vs last month's spending on their categories (coral if short). Plan B switch only if Emergency ≥ 10%; target defaults per BR §12.2 and becomes the Emergency fund goal. |
| 5 Where it lives | One select per bucket, pre-filled (BR §12.3); preview "What payday will look like" with keep and send rows (arrows, not checkboxes) and "N transfers each payday. Fewer homes means fewer transfers." | User changes are kept if they go back and forth, as long as the account still exists. |
| 6 First pay | "Has money come in since your last payday?" → **Yes, I'll add it** (amount prefilled with the usual amount, date ≤ today) or **Not yet** | See §7.5. |

### 7.4 App path (7 steps)

| Step | Shows | Acceptance |
|---|---|---|
| 1 Your app | If sync is off: "Turn on sync in the Salin app" with three numbered steps and a live "Waiting for your phone…" status (Supabase Realtime on `accounts`/`ledger_entries` for this user). **Continue without the app** → web path from scratch. When rows arrive: "Found your Salin data" with counts (accounts, categories, entries since, income since), account checkboxes ("Accounts in your plan", all on) and a note that phone logging keeps working | The landing account can't be unticked. Nothing on the phone changes until the user confirms something. |
| 2 Income | Detected sources (BR §12.4): name, recent amounts and dates, cadence, a **main pay** radio, a rule select per non-main source (Split by my plan · Keep it whole · Its own split · Ask me each time) prefilled from its kind; next main payday (guessed, editable) | Exactly one main pay. Scholarship kept whole is explained in a note. |
| 3 Priorities | Same as web; fixed bills prefilled from mobile `recurring_rules` (outflows), including a future start date | |
| 4 Your plan | Same as web, built on the main pay's latest amount; reality checks use last month's spending | |
| 5 Where it lives | Same as web, suggestions use the mobile account types | |
| 6 Categories | "We sorted your 16 categories into buckets" (BR §12.5). The ones it isn't sure about are listed first with a bucket select; the rest show as pills grouped by bucket | Going back and turning a bucket off sends its categories back to the "not sure" list. |
| 7 First pay | "Your {date} pay is waiting for a job": the latest main pay, landed account, amount; a note listing other income waiting in Money in and what will happen to each; **Give it a job** / **Do it later** | See §7.5. |

### 7.5 First pay finish (both paths)

1. **Split:** "₱25,000.00 from Salary, split by your plan": animated bars per bucket (same split rule as the engine), a note if bills start later. **Confirm split** creates the allocation (`confirm_incomes`).
2. **Move the money:** keep row + one checkbox row per transfer, "N of M sent". Ticking records real transfers (BR §3.6). **I'll send them later** finishes with transfers left open in Money in.
3. **Done:** green card "Every peso has a home." with: ₱X split into N buckets · Your accounts match your plan (or "Everything stays where it landed") · Safe to spend until {next payday}: ₱X (minus spending already logged this period, and it says so) · sun-check "Your Emergency fund has started: ₱X" if any. Burst once. Slip stamps PLAN SET. **Open Today**.
4. **Not yet / Do it later:** "That's fine. Payday is the moment." + reminder choice (Email me on payday · No reminder) + **Open Today**. In the app path the waiting pay goes to Money in.
5. Finish writes everything (DATA_MODEL.md §2) in one transaction, then Today plays the ribbons growing from zero.

### 7.6 Just track for now

- Skipping on Priorities creates a one-bucket plan: **Spending 100%**, no Plan B, every bucket kept where pay lands, all categories in Spending, no goals. The user still gets the First pay step (no transfers).
- Back from First pay returns to Priorities and undoes the skip.
- Today's checklist reads: Income and accounts set up ✓ · Make a plan · First pay recorded · First spending logged · First week closed. The next-step card offers **Make a plan** ("Right now everything you get goes to Spending…").
- **Make a plan** reopens onboarding at Priorities → Your plan → Where it lives (→ Categories in the app path) with the slip, then **Save my plan**. It applies to future paydays only; categories the user moved by hand stay put; existing goals are kept.

### 7.7 Accessibility and motion

- Every option is a native radio or checkbox inside a label, with visible focus on its card or chip. Steppers have labelled buttons and a labelled number field.
- Focus: step heading on step change; the clicked control after in-step re-renders; the first transfer after Confirm split; the done card's heading at the end.
- Reduced motion: no slip print highlight, no bar growth, no example ribbons growing, no pulse on "Waiting for your phone".

## 8. Log spending (web)

- Opens from Today (+ Log spending, and the next-step card in the first week) as a side sheet (full width on phones). Fields: **Amount** (big, focused), **Category** (grouped by bucket), live impact line ("From Living: ₱9,500.00 left → ₱9,320.00", plus the new per-day safe amount for Spend buckets; coral if it goes below zero), **What was it?** (optional), **Paid from** (defaults to the bucket's account), **Date** (≤ today).
- **Log it** saves, closes, shows the Logged flag on Today and returns focus to + Log spending. **Log and add another** keeps the sheet open with the same category and date.
- Errors: "Enter what you spent, above ₱0." · "That amount looks too large. Check the number of zeros." · "Pick a category, so it comes out of the right bucket."
- Writes an outflow `ledger_entries` row (`origin = manual`, accountId, categoryId, occurredAt) so it syncs to the phone; the `entry_buckets` trigger stores its bucket.
- Escape or the scrim closes; focus is trapped while open.
