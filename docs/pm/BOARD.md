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
| 8 | Plans → Split plan + Rules | doing | Wave 3 agent A, worktree `plans-split-income` (with 9) |
| 9 | Plans → Income sources | doing | Wave 3 agent A (with 8) |
| 10 | Money in → queue, Add income, confirm | doing | Wave 3 agent B, worktree `money-in`; Step 2 left as `MoveMoneyStep` slot for 11 |
| 11 | Transfer checklist (G7, G8) | todo | After 10 (lives in Money in Step 2) |
| 12 | Today shelf + safe to spend + next step (G9) | todo | |
| 13 | Plans → Accounts, Categories, Goals (G12) | doing | Wave 3 agent C, worktree `plans-accounts` |
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
Wave 3 running (Oct 11, browser tests deferred by owner until Docker works). Agents: A = 8+9, B = 10, C = 13, each in `.claude/worktrees/<name>` with `SALIN_DB=salin_w3{a,b,c}`, migration ranges 202610110010xx/11xx/12xx, pgTAP ranges 2x/3x/4x. Then 11 on top of 10.
Open for owner: confirm P-1; fix Docker for e2e (every page is behind auth now).
