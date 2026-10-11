# Resume: Salin Web build

Paused Oct 11, 2026 at the owner's request, partway through Wave 2. Start a new session by reading this file, then `docs/pm/BOARD.md`.

## How we work

- Claude (Opus) is PM/architect. Sonnet agents (`model: "sonnet"`) do the development and testing.
- Agents don't commit. The PM reviews, re-runs every check, and commits each ticket.
- Run at most 3 agents in parallel, in separate folders. If an agent needs its own database, it runs in a git worktree with Supabase ports shifted +1000.
- Stop for the owner's OK at the end of each wave, with a usage summary. Log every agent in `docs/pm/USAGE.md`.
- Scope is Phase 0 + Phase 1 (ROADMAP tickets 1–20).

## Read first

| File | Why |
|---|---|
| `CLAUDE.md` | Hard rules for agents |
| `salin-web-handoff/` | The spec (start with `AGENTS.md`, then `BUSINESS_RULES.md`, `DATA_MODEL.md`, `SPEC.md`) |
| `salin-web-handoff/DECISIONS.md` §4–§5 | Kickoff decisions (all handoff recommendations accepted) and PM decisions P-1…P-6 |
| `docs/pm/BOARD.md` | Ticket status |
| `docs/pm/USAGE.md` | Token ledger |
| `supabase/BASELINE_NOTES.md` | How the live schema differs from DATA_MODEL.md |

## Safety rules (non-negotiable)

- The live Supabase project `salin-v2` (ref `nopfvizscdxzvissibwn`) is shared with the mobile app. Treat it as **read-only**.
- Never run `db push`, `--linked`, or remote migrations. Don't link the repo folder. A linked scratch folder was used once for the read-only schema dump.
- The `updatedAt` trigger (D-16) and the triggers on mobile tables (P-5) must not reach live until they've been tested against a real phone sync.
- Money is integer centavos everywhere. Never alter the 12 mobile-synced tables.

## State on `main`

| Ticket | Status | Commit |
|---|---|---|
| 1 Scaffold, tokens, components, shell, CI | done | `c85c328` |
| 2 Baseline schema = live dump; enum map test | done | `e08b8c8`, `f1b69a2` |
| 5 Mobile row layer + Dart compat test (41 tests) | done | `56caca6` |
| 6 Web tables + RLS + pgTAP (346 tests) | done | `e08b8c8` |
| lib/money engine, all goldens G1–G12, O1–O6 (240 tests) | done | `f1b69a2` |

Checks on main: `npm run lint`, `npm run typecheck`, `npm test` (268), `npm run e2e` (76), `supabase test db` (346), `npm run test:mobile-compat` (41).

## Unfinished work (on branches, untested)

### Ticket 7: SQL engine, branch `wip/sql-engine` (commit `c94508d`)

What's there:
- Migrations `..0300_transfer_cycles.sql`, `..0400_engine_functions.sql` and `..0500_mobile_table_triggers.sql`.
- pgTAP edits to `02_rls.sql` and `03_allocations_immutable.sql`.

Still to do:
1. Run `supabase db reset && supabase test db`, and fix until it passes.
2. pgTAP goldens at SQL level: G1–G10, G12, idempotency, P-1, P-4, tick/untick shape, cycles, cross-user, and the triggers (including "a trigger error doesn't block the mobile insert").
3. `tests/parity/` + `npm run test:parity`: about 500 seeded random cases run through `lib/money` and through SQL, which must match exactly. Also `transfer_plan` parity.
4. Export a ticked transfer and its legs to `tests/mobile-compat/fixtures/{transfers,ledger_entries}/db-tick*.json`, then run `npm run test:mobile-compat`.
5. Regenerate `lib/database.types.ts`.

Notes the PM sent to the agent, which the code must follow:
- Transfer ids are `gen_random_uuid()::text`; legs are `<id>_out` / `<id>_in`.
- `note` is 'Transfer' when empty.
- Both legs: origin 3, `categoryId` null, `syncStatus` 2.
- Insert the transfer before its legs.
- Set `updatedAt` = server now (ms) explicitly on every insert and soft delete.
- Soft delete only.

The full original brief is the "SQL engine, triggers, parity" prompt. If you need it, re-derive it from DATA_MODEL §3–4, BUSINESS_RULES §2–5, and DECISIONS P-1, P-3, P-4 and P-5.

### Tickets 3 + 4 (web half): auth + read-only Today

- Branch `worktree-agent-a8b446ac93ca02865` (commit `ec1f7c7`), worktree at `.claude/worktrees/agent-a8b446ac93ca02865`.
- What's there: sign-in, sign-up, `/auth/callback`, route protection, onboarding redirect behind `NEXT_PUBLIC_ONBOARDING_ENABLED` (P-6), `lib/data` (Today queries), `lib/analytics` (typed `track()` into `events`), `lib/time`, the Today components, and e2e specs.
- It stopped while writing `tests/e2e/helpers/`.

Still to do:
1. To run it, re-apply locally (don't commit): in the worktree's `supabase/config.toml`, set `project_id = "salin-web-wt"` and shift every port by +1000. Also create `supabase/.temp/postgres-version` containing `17.6.1.147`.
2. Finish the e2e helpers. They seed users with the local service-role key, plus mobile-shaped rows. Get lint, typecheck, test, build and e2e green.
3. Switch the e2e seeding to `lib/domain/mobile` builders, which are now on main. Rebase onto main first.
4. PM review, then merge into main. Revert the config.toml port change first, and run `supabase stop`.

## Next waves (after the above)

- **Wave 3:**
  - Plans → Split plan + Rules (8), Income sources (9), Accounts/Categories/Goals (13).
  - Money in queue, Add income and confirm UI (10).
  - Transfer checklist UI (11).
- **Wave 4:**
  - Today shelf, safe to spend, next step and goals (12).
  - Review + close the week (14).
  - Log spending sheet (19).
- **Wave 5:**
  - `suggest_plan` SQL (16), onboarding shell and app path (17), first pay + `finish_onboarding` (18), web path, Just track and Make a plan (20).
  - Motion and reward pass (15), a11y and reduced-motion pass.
- **Known follow-ups:**
  - At 390px the Plans sub-nav hides "Goals".
  - Cross-user id references aren't guarded by FKs, so the SQL functions must check ownership.
  - Read-only types for the other 8 mobile tables.

## Local environment

- Postgres image 17.6.1.165 is broken on this Mac (empty entrypoint). `supabase/.temp/postgres-version` is pinned to `17.6.1.147`, which matches live. `.temp` is gitignored, so recreate the pin if needed.
- Start Supabase with `supabase start -x edge-runtime,logflare,vector,imgproxy,studio,mailpit,storage-api,realtime,postgres-meta`. Add `realtime` back for onboarding's "Waiting for your phone…" step.
- Docker Desktop must be running.
- Flutter + Dart 3.12 are installed. The mobile repo is at `/Volumes/RolfStuffs/Developer/salin-v2` (read-only).

## Open questions for the owner

- **P-1:** no allocation line goes below ₱0 on amounts under about ₱1. This is implemented and marked pending confirmation.
- **Owner-side checklist** (in BOARD.md): Vercel project and env vars, the mobile analytics PR, a real-device sync round-trip, and the D-16 mobile pull fix.

## Usage so far

| Item | Amount |
|---|---|
| Finished agents (4), reported | ~537K tokens |
| Stopped agents (2), from transcripts | ~275K fresh input, ~5.4M cache reads |
| Cache reads, all 6 agents | ~13M |
| Time | ~1.5 h, 6 Sonnet agents |

Opus PM usage is not reported per turn. Per-agent detail is in `docs/pm/USAGE.md`.
