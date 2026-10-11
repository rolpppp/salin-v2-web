# Roadmap

Measure first, then ship the paycheck plan the owner already uses, then widen it to other users. Each phase ends at a gate; don't start the next phase until the gate passes.

## Phase 0: Foundations and measurement

Goal: a safe base and a retention baseline.

- Repo: Next.js + TypeScript strict, lint, Vitest, Playwright, CI, Vercel previews.
- Supabase: baseline schema dump committed as migration 1; generated types; enum map + test (DATA_MODEL.md §1.3).
- Auth: sign in with the same Supabase accounts as mobile.
- Analytics: PostHog (or `events` table) in web **and** mobile (mobile has none today). Events in §4.
- Design tokens and base components from DESIGN.md (buttons, cards, fields, segmented control, receipt, live region).
- Read-only Today: real accounts and spending for a synced user, no plan yet.

**Gate:** owner can sign in and see his real mobile data; a web-created test row round-trips through mobile sync; 2 weeks of mobile retention data collected.

## Phase 1: Paycheck plan (the product)

Goal: the owner retires the Google Sheet.

1. New tables, RLS, pgTAP (DATA_MODEL.md §2, §5).
2. Allocation engine in SQL + TS mirror; golden tests G1–G6 (BUSINESS_RULES.md §10).
3. Plans: Split plan (incl. Kept in, rules), Income sources, Accounts, Categories (with `entry_buckets` trigger + backfill), Goals.
4. Money in: queue, Add income, job choice, confirm, slip.
5. Transfer checklist: netting, sent amounts, real transfers; G7, G8, G12.
6. Today: safe to spend, next step, week loop, shelf with previews, goals, drawer, cover from Buffer; G9, G10.
6a. Onboarding, app path first (the owner's path): sync detection, income found, priorities, plan builder, homes, categories, first pay; `suggest_plan`, `finish_onboarding`; O2, O5, O6.
6b. Log spending sheet on Today.
7. Review: week slip, one thing to look at, close the week.
8. Motion and rewards pass (DESIGN.md), reduced-motion pass, a11y pass.
9. Import the owner's sheet history (Income and Spending tabs) once, by script.

**Gate:** owner uses only Salin Web for 4 weeks; every golden test passes; no mobile sync regressions.

## Phase 2: Widen

Goal: other users can start without help.

- Onboarding, web path (new to Salin), "Just track" and "Make a plan" re-entry; O1, O3, O4; payday reminder email (D-28).
- Sheet / CSV import for anyone.
- Multi-currency: real rate per foreign income, A$ retained; daily FX rates (D-21).
- Reconcile: type a real balance, see the gap vs "should hold".
- Net worth, opt-in (D-8). PWA (D-22).
- Undo a confirmed income (D-5).

**Gate:** 10 outside users complete onboarding (median under 5 minutes); week-4 retention of plan users ≥ non-plan users.

## Phase 3: Deepen the habit

- Goal projections ("about N more paydays", due dates).
- Year view: 12 months of in / out / put away, per-bucket heat map.
- Weekly review email (opt-in, D-24). Quarterly tax reminder for the Tax bucket.
- Ledger: full transaction table with keyboard entry.

## Phase 4: Bring it to mobile

- Mobile reads `buckets`, `allocations`, `entry_buckets` and shows what's left per bucket and "income waiting for a job" (no engine in Dart; it reads Postgres results).
- Mobile prompt: "Turn on sync to plan on the web."

## First tickets (Phase 0–1, in order)

| # | Ticket | Done when |
|---|---|---|
| 1 | Scaffold app, CI, Vercel, tokens | Empty shell deploys; tokens match DESIGN.md; Playwright smoke at 390/1440 |
| 2 | Baseline schema dump + types + enum map test | Migration 1 applies cleanly to a branch DB; enum test passes |
| 3 | Auth + read-only Today (accounts, spending this week) | Owner sees real data |
| 4 | Analytics events (web + mobile PR) | Events in §4 visible in the dashboard |
| 5 | Web-created row round-trip test with mobile | Account created on web appears on mobile after sync |
| 6 | New tables + RLS + pgTAP | RLS tests pass for every table |
| 7 | `split_by_plan`, `split_own` + TS mirror | G1–G6 pass in pgTAP and Vitest |
| 8 | Plans → Split plan + Rules | Edits save; invalid totals refused; changes only affect future |
| 9 | Plans → Income sources | Four rules, own split editor, presets |
| 10 | Money in → queue, Add income, confirm | `confirm_incomes` writes allocations with snapshots |
| 11 | Transfer checklist | G7, G8 pass e2e; ticks create mobile-style transfers |
| 12 | Today shelf + safe to spend + next step | G9 passes e2e |
| 13 | Plans → Accounts, Categories (+ entry_buckets trigger/backfill), Goals | G12 passes; archive blocked when in use |
| 14 | Review + close the week | Slip reconciles; week_reviews row stored |
| 15 | Motion + reward pass | Matches DESIGN.md; reduced motion verified |
| 16 | `suggest_plan` (SQL + TS) | O1–O5 pass in pgTAP and Vitest |
| 17 | Onboarding shell, plan slip, app path steps | SPEC §7.2, §7.4 acceptance; draft resumes on another device |
| 18 | First pay finish + `finish_onboarding` | One transaction; Today grows from zero; O6 e2e |
| 19 | Log spending sheet | SPEC §8; entry syncs to the phone |
| 20 | Web path + Just track + Make a plan | SPEC §7.3, §7.6; confirmed paydays unchanged after Make a plan |

## 4. Analytics events

Names are `snake_case`; never include amounts, names or account details in properties beyond what's listed.

| Event | Properties |
|---|---|
| `web_signed_in` | first_time (bool) |
| `plan_setup_completed` | preset, buckets_count |
| `income_added` | source_kind, via (`web` / `mobile`) |
| `income_confirmed` | source_kind, job, count, hours_since_landed |
| `transfer_ticked` | is_partial (bool) |
| `money_in_completed` | incomes_count |
| `cover_used` | from_bucket, to_bucket |
| `review_opened` | week_start |
| `week_closed` | open_items_count |
| `plan_edited` | field (`percent` / `kept_in` / `rule` / `target`) |
| `goal_milestone_passed` | goal_kind, milestone (25/50/75/100) |
| `onboarding_started` | path (`web`/`app`), auto_detected (bool) |
| `onboarding_step_completed` | path, step, seconds_on_step |
| `onboarding_plan_edited` | preset, buckets_changed (count) |
| `onboarding_skipped_plan` | path |
| `onboarding_completed` | path, plan_mode, first_pay (`confirmed`/`later`), transfers_ticked (count), minutes |
| `sync_prompt_shown` / `sync_connected` | seconds_waited |
| `spending_logged` | via (`web`/`mobile`), bucket_group |

## 5. Success metrics

| Metric | Measured as | Target |
|---|---|---|
| Sheet retired | Owner uses only Salin Web for a full month | Phase 1 gate |
| Week-4 retention | Share of new users active in week 4, plan vs non-plan | Plan ≥ non-plan; target set after Phase 0 baseline |
| Payday completion | Incomes confirmed within 48 h ÷ incomes landed | Set after baseline |
| Weekly review rate | Weeks closed ÷ active user-weeks | Set after baseline |
| Logs per active week | Spending entries per user-week | Doesn't drop after web launch |
| Sync opt-in | Mobile users with sync on | Grows after the mobile prompt |
| Onboarding completion | `onboarding_completed` ÷ `onboarding_started`, per path and per step (drop-off) | Set after the first 50 users |
| Time to first split | Sign-up → first `income_confirmed` | Most within the first payday |
