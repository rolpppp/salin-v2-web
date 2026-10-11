# Build board

Scope: Phase 0 + Phase 1 (ROADMAP tickets 1–19, plus web-path onboarding basics). PM/architect: Claude Opus. Dev/test agents: Sonnet.

Status: todo · doing · review · done · blocked

| # | Ticket | Status | Notes |
|---|---|---|---|
| 1 | Scaffold app, CI, tokens, base components, shell | done | c85c328. Follow-up: Plans sub-nav hides "Goals" at 390px |
| 2 | Baseline schema dump + types + enum map test | done | e08b8c8 (baseline = live dump), f1b69a2 (enum test) |
| 3 | Auth + read-only Today | done (e2e pending) | c164352. Lint/typecheck/unit/build green; PM fixes: nowMs helper, always-dynamic server client, safeNext control-char open redirect. E2E not run (needs Supabase Auth/Docker); helpers still to switch to lib/domain/mobile |
| 4 | Analytics events (web) | done (web half) | c164352 (lib/analytics). Mobile PR is owner-side |
| 5 | Web-created row round-trip with mobile | done | lib/domain/mobile + 41 Dart tests through mobile's real pull path. Real-device test is owner-side |
| 6 | New tables + RLS + pgTAP | done | e08b8c8, 346 pgTAP. Follow-up: cross-user id refs not FK-guarded; functions must check ownership |
| 7 | split_by_plan, split_own + TS mirror (G1–G6) | done | 7b4d136. 641 pgTAP, parity 500 cases, db-tick fixtures through Dart pull. `tick_transfer` amount = running total for the pair; a repeat tick with the same total raises P0001 "already sent" (ticket 11 UI must treat it as already-ticked). `database.types.ts` hand-edited: regen when Docker works. P-5 triggers not for live yet |
| 8 | Plans → Split plan + Rules | done (e2e pending) | 76ac6e8. save_plan_lines (10000 bp), kept-in, Plan B switch target; pgTAP 20 |
| 9 | Plans → Income sources | done (e2e pending) | 76ac6e8. Rules, own split, presets, lands-in, archive/remove; pgTAP 21 |
| 10 | Money in → queue, Add income, confirm | done (e2e pending) | cc500a1. confirm_incomes_with_jobs (atomic picks + confirm); Step 2 slot for 11. Follow-ups: Money in tab badge (SPEC §0), Today "+ Add income" → /money-in?add=1, Add income is ledger insert + income_meta upsert with compensating soft delete (not one txn), PostgREST embeds untested |
| 11 | Transfer checklist (G7, G8) | done (e2e pending) | fb88208. Ticks via RPC only; stale-amount guard; P0001 = already ticked; undo for partial rows. Follow-ups: completion card conditional lines ("Living back above zero", "Emergency passed 25%") need before/after state; Today buckets-grow animation (ticket 12/15) |
| 12 | Today shelf + safe to spend + next step (G9) | done (e2e pending) | 3c872eb. G9/G10 in Vitest on the view model; e2e specs unrun. Choices: 'Last payday split' never drives the next-step card; last Work payday = latest salary-kind source; Put away/Tax leaders = this month's allocations by income date; shelf floor ₱14,000 then ₱2,000 steps; past nextPaydayDate treated as unset; Getting started needs onboardedAt (ticket 17). Follow-ups: cover from another bucket when Buffer is short; goal_milestone_passed not fired yet (needs a non-render trigger, ticket 15); lib/data/balances.ts now unused; Logged flag sits in the greeting actions row (polish in 15) |
| 13 | Plans → Accounts, Categories, Goals (G12) | done (e2e pending) | 4218c59. archive_account in-use guard in SQL (G12), categories move/remove + backfill, goals; 6 new mobile-compat fixtures; pgTAP 41 |
| 14 | Review + close the week | done (e2e pending) | 0a0b90b. Slip: bucket lines = all-time left; Spent = this week; Came in = this week's income + 'carried from earlier weeks' line (identity holds; pgTAP-tested with a Tax spend and a cover). close_week computes checks server-side, idempotent; nudge_plan_percent changes both plans (D-18). Tab badges via tab_badges RPC (cached per request). Review badge only on reviewDay itself. pgTAP 67 |
| 15 | Motion + reward pass | todo | |
| 16 | suggest_plan SQL + TS (O1–O5) | done | SQL in the onboarding migration; O1–O5 pgTAP; parity 240 grid + 200 random + invariants + 250 category names |
| 17 | Onboarding shell + app path steps | doing | Wave 5a agents `onboarding-shell` (shell, routes, autosave, app path) + `onboarding-steps` (Priorities, Your plan, Where it lives). Contract: lib/onboarding/draft.ts + step.ts (P-8) |
| 18 | First pay finish + finish_onboarding (O6) | doing | SQL merged (finish_onboarding, apply_plan_only; O6 = 4 transfers; pgTAP 121). Choices: Emergency bucket always created (confirm_incomes needs it); switch rule only when Plan B on; idempotency returns the stored summary from an `events` row `onboarding_finished` (revisit: analytics table as state); phone spending before the first pay's date isn't frozen into buckets, and with "later" nothing is, so safe to spend may be overstated until the first confirm; first-pay date uses the Manila day (should be user's zone). §7.5 UI in Wave 5b |
| 19 | Log spending sheet | done (e2e pending) | c2d1dc8. Home-currency accounts only (ledger_entries has no currency); unmapped expense categories hidden; no payday → per-day line omitted. Follow-ups: Today (12) should share getBucketLefts/daysUntil; date max assumes page not left open past midnight |
| 20 | Web path + Just track + Make a plan | todo | |

## Owner-side checklist (can't be done by agents)
- [x] `supabase link --project-ref nopfvizscdxzvissibwn` (DB password) so the baseline schema can be dumped read-only
- [ ] Vercel project + env vars
- [ ] Mobile analytics PR + real-device sync round-trip
- [ ] D-16 mobile pull fix before the `updatedAt` trigger touches live

## Local env notes
- **DB work uses native Postgres 17 (P-7):** Homebrew `postgresql@17` on port 5433 (`brew services start postgresql@17`), pgTAP 1.3.3 built from source into it. `npm run db:reset` / `npm run db:test`; `SALIN_DB=<name>` per parallel agent. Docker only for auth/PostgREST e2e.
- Postgres image 17.6.1.165 is broken on this Mac (empty entrypoint); `supabase/.temp/postgres-version` pinned to 17.6.1.147 (matches live). Start with `supabase start -x edge-runtime,logflare,vector,imgproxy,studio,mailpit,storage-api,realtime,postgres-meta`.

## Resume here
**Wave 4 closed (Oct 11).** 12, 14, 19 merged; e2e specs written but NOT run. Checks on main: 950 pgTAP, parity 500 cases, 665 unit, 67 mobile-compat, lint/typecheck/build.
Next: Wave 5 (16 suggest_plan, 17 onboarding shell + app path, 18 first pay + finish_onboarding, 20 web path; then 15 motion + a11y) — waiting for owner OK.
Before Phase 1 gate: get Docker working, recreate `.env.test.local` from `supabase status`, run the whole e2e suite, regenerate `lib/database.types.ts`.
Open for owner: confirm P-1; Docker Desktop reports running but the engine socket never appears (system disk now 4.4 GB free, still not enough or the VM is wedged). Needs a manual Docker restart / Troubleshoot → Restart, or more free space.
