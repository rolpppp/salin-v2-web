# Decisions

Owner: **Rolf** decides everything marked Open. Agents: don't build past an Open decision that blocks your ticket; build the recommendation behind a flag only if the owner says so. Record every new answer here (date, decision, who).

Status key: **Approved** (owner said yes) · **Settled by prototype** (the owner reviewed and kept a prototype that embodies it; confirm at kickoff) · **Open**.

## 1. Original decision table (from the plan doc)

| # | Decision | Status | What it means for the build |
|---|---|---|---|
| 1 | Buckets vs category budgets | Approved | Buckets replace budgets when a plan is on; category budgets nest inside a Spend bucket. One "what's left" number. |
| 2 | Overspent bucket | Approved, then changed in design | Coral "Needs ₱X" (not amber, not red) plus a "Cover from Buffer" suggestion. Never move money automatically. |
| 3 | Income that isn't split | Approved | Waiting income sits in Money in ("To assign" on the week slip); assign by plan, own split, one bucket, or ask. |
| 4 | Transfer checklist | Approved | Ticking records a real mobile-style transfer, storing the amount sent. |
| 5 | Editing a past payday | **Open** | Recommendation: each confirmed income can be "undone" (allocations soft-deleted, transfers it caused flagged) and re-confirmed; plan changes never re-split old paydays. v1 can ship without undo. |
| 6 | First outside user | **Open** | Recommendation: freelancer paid abroad (owner is the reference user); student preset still ships. |
| 7 | Devices | Settled by prototype | Responsive; designed at 1440, works at 390. |
| 8 | Net worth at launch | **Open** | Recommendation: Phase 2, opt-in tab, never the home screen. |
| 9 | Quick Add AI on web | **Open** | Recommendation: later. Logging stays on the phone. |
| 10 | Default mode | Approved (Oct 11), changed | Plan by default, skippable. Onboarding guides everyone to a plan built from their numbers; "Skip the plan, just track for now" gives a one-bucket Spending plan and Today offers "Make a plan" (SPEC.md §7.6). |
| 11 | Design language | Settled by prototype | New web look (DESIGN.md: "Fresh & bright", mint/teal, Public Sans), not a port of mobile tokens. Keep the mobile brand values. |
| 12 | Screens to design first | Settled by prototype | Today, Money in, Review, Plans and onboarding (both paths) are designed. Still undesigned: sign-in/sign-up, Ledger, Year view. |
| 13 | Where designs live | Settled by prototype | Design artifacts in Claude; move to Figma if a designer joins. |

## 2. Decisions made during design (owner feedback, Oct 2026)

| Date | Decision |
|---|---|
| Oct 9 | Round-1 UI rejected as cold, busy and unrewarding. Redesign around cognitive-psychology rewards (endowed progress, goal gradient, open loops, peak-end, fresh start), one primary action per screen, three bucket groups. |
| Oct 9 | Palette "Fresh & bright"; bucket shelf kept but softer; fix all four round-1 issues. |
| Oct 9 | No streaks, badges or confetti for routine actions. Celebrations only when a loop really completes. |
| Oct 10 | Income comes from **any source** (salary, scholarship, side hustle, allowance, gift, refund, other). Each source has a rule: split by plan · its own split · keep whole in one bucket · ask each time. Kinds come with starter rules (side hustle: Tax 10 / Sinking 40 / Fun 50). |
| Oct 10 | Income can be added on the web (Add income form) as well as arriving from mobile. |
| Oct 11 | Plans has five sections: Split plan, Income, Accounts, Categories, Goals. |
| Oct 11 | Onboarding for every user, two paths: web only, and web + Salin app (sync on, or a guided "turn on sync" step). Ends with the first pay given a job when possible. |
| Oct 11 | First plan comes from three questions (how you're paid, what you want first, fixed bills) → a suggested plan showing the user's own pay split live, fully editable (BUSINESS_RULES.md §12). |
| Oct 11 | Spending can be logged on the web (quick sheet from Today), for web-only users and anyone at a desk. |
| Oct 11 | Honesty fixes adopted: "ask" sources are never pre-assigned; an own split ≠ 100% is never rescaled; changing where a bucket is kept never rewrites past transfers; an account in use can't be archived; the week slip must reconcile. |

## 3. Open rule questions (need an answer before the ticket that uses them)

| ID | Question | Options | Recommendation | Blocks |
|---|---|---|---|---|
| D-14 | What counts toward the Plan B switch? | (a) Emergency fund's current left amount (prototype) · (b) sum of all Emergency allocations ever, ignoring withdrawals (owner's sheet) | (b) matches the sheet and doesn't flip back to Plan A after a withdrawal; show "Now ₱X" with the same measure | Allocation engine |
| D-15 | Where does "next payday" come from? | (a) user setting · (b) Work source cadence · (c) mobile `recurring_rules` | **Resolved in onboarding:** web path asks for it; app path guesses from the last three paydays (BR §12.4) and the user confirms. After each payday, suggest the next date from the frequency. | Safe to spend per day |
| D-16 | Server-time `updatedAt` trigger | Enable now · after a mobile change | Mobile's pull compares against the phone clock, so a phone ahead of the server could miss web edits. Ship the trigger together with a mobile change that stores the server's max `updatedAt` from each pull | Migration 2 |
| D-17 | Rent redirect: by income date or confirm date? | income date · confirm date | Income date (`occurredAt`), so late confirming doesn't change the split | Allocation engine |
| D-18 | "Move 1% from Fun to Living" in Review | active plan only · both plans | Both plans (Living's need doesn't depend on the plan); say so in the confirmation | Review |
| D-19 | Cover from Buffer when Buffer is short | cover what's there and name the rest · block | Cover what's there, say what's still needed, offer another bucket (BR §4.3) | Cover |
| D-20 | "E-wallet + cash" account type | map to eWallet · split into two accounts | Map to eWallet for v1; suggest splitting in first-run | Accounts |
| D-21 | FX source replacing GOOGLEFINANCE | — | Pick a free daily AUD/USD→PHP feed in Phase 2; until then store the real rate per income only | Phase 2 |
| D-22 | PWA? | web only · installable PWA | PWA in Phase 2 (payday and review on a phone browser) | — |
| D-23 | How many users have sync on? | — | Measure in Phase 0; it sizes the first web audience | Phase 1 gate |
| D-24 | Weekly review email | v1 · later | Phase 3, opt-in, one number + one action | — |
| D-25 | Which income categories mark which source when a mobile inflow has no category? | Others · ask | Others (rule: ask) | Income recognition |
| D-26 | Priority profiles and preset numbers (BR §12.1) | sign off · adjust | Sign off on the table, then tune with Phase 2 onboarding data (how often each share is edited) | Plan suggestion |
| D-27 | Safety-net target | 3 months of bills + living · 6 months · user-picked | 3 months to start (reachable), editable on the plan step | Plan suggestion |
| D-28 | Payday reminder channel | email · web push · mobile push via the app | Email in v1 (Edge Function + pg_cron on `nextPaydayDate`); app push once mobile reads buckets (Phase 4) | First pay "Not yet" |
| D-29 | Detecting "uses the Salin app" | ask always · auto-detect synced rows | Auto-detect; ask only when there's nothing synced. If they say they use the app but sync is off, guide them to turn it on (SPEC §7.4) | Welcome |
| D-30 | Bills that exceed 45% of pay | cap and warn · no cap | Cap at 45% and warn with the gap; never silently underfund (BR §12.1) | Plan suggestion |

## 4. Decisions recorded at build kickoff (Oct 11, 2026, Rolf)

Rolf accepted the recommendation for every Open item below at build kickoff. Agents build to these; changing one later is a new decision.

| ID | Decision |
|---|---|
| D-5 | v1 ships without undo; plan changes never re-split old paydays. Undo is Phase 2. |
| D-6 | First outside user: freelancer paid abroad; student preset still ships. |
| D-8 | Net worth: Phase 2, opt-in tab, never home. |
| D-9 | Quick Add AI on web: later. |
| D-14 | Plan B switch measure = **sum of all Emergency allocations ever** (ignores withdrawals). Behind `active_plan()`; Rules card "Now ₱X" uses the same measure. |
| D-16 | Server-time `updatedAt` trigger is written as its own migration but **must not be applied to the live project** until the mobile pull fix ships. New web tables get it from day one. |
| D-17 | Rent redirect uses the income date (`occurredAt`). |
| D-18 | "Move 1% from Fun to Living" changes both plans; the confirmation says so. |
| D-19 | Cover from Buffer when short: cover what's there, name the rest, offer another bucket. |
| D-20 | "E-wallet + cash" maps to eWallet in v1. |
| D-21 | Store the real rate per income only until Phase 2. |
| D-22 | PWA in Phase 2. |
| D-24 | Weekly review email: Phase 3, opt-in. |
| D-25 | Uncategorised mobile inflows go to the "Others" source (rule: ask). |
| D-26 | Priority profiles and preset numbers in BR §12.1 signed off as written. |
| D-27 | Safety-net target: 3 months of bills + living, editable. |
| D-28 | Payday reminder: email in v1 (Edge Function + pg_cron). |
| D-29 | Auto-detect synced rows; ask only when nothing is synced. |
| D-30 | Bills capped at 45% with a warning showing the gap. |

**Environment rule (Oct 11):** all development and tests run against a local Docker Supabase. The live project `salin-v2` (ref `nopfvizscdxzvissibwn`) is read-only for the schema dump; nothing is written to it without Rolf's explicit OK.
