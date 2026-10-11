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
| 12 | Today shelf + safe to spend + next step (G9) | todo | |
| 13 | Plans → Accounts, Categories, Goals (G12) | done (e2e pending) | 4218c59. archive_account in-use guard in SQL (G12), categories move/remove + backfill, goals; 6 new mobile-compat fixtures; pgTAP 41 |
| 14 | Review + close the week | todo | |
| 15 | Motion + reward pass | todo | |
| 16 | suggest_plan SQL + TS (O1–O5) | todo | |
| 17 | Onboarding shell + app path steps | todo | |
| 18 | First pay finish + finish_onboarding (O6) | todo | |
| 19 | Log spending sheet | todo | |
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
**Wave 3 closed (Oct 11).** 8, 9, 10, 11, 13 merged; all e2e specs written but NOT run. Checks on main: 867 pgTAP, parity 500 cases, 511 unit, 63 mobile-compat, lint/typecheck/build.
Next: Wave 4 (12 Today shelf/safe to spend/next step, 14 Review + close the week, 19 Log spending) — waiting for owner OK.
Before Phase 1 gate: get Docker working, recreate `.env.test.local` from `supabase status`, run the whole e2e suite, regenerate `lib/database.types.ts`.
Open for owner: confirm P-1; system disk 100% full (1.3 GB free), likely why Docker's engine won't start.
