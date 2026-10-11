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
| 5 Mobile row layer + Dart compat test | done | `56caca6` |
| 6 Web tables + RLS + pgTAP | done | `e08b8c8` |
| lib/money engine, all goldens G1–G12, O1–O6 | done | `f1b69a2` |
| P-7 native PG17 for DB work | done | `85b6fdf` |
| 7 SQL engine + pgTAP goldens + parity | done | `7b4d136` |

Checks on main: `npm run lint`, `npm run typecheck`, `npm test` (268), `npm run e2e` (76), `npm run db:reset && npm run db:test` (641), `npm run test:parity` (500 cases), `SALIN_MOBILE_PATH=/Volumes/RolfStuffs/Developer/salin-v2 npm run test:mobile-compat` (51; the env var is needed when run from a worktree).

## Unfinished work

### Tickets 3 + 4 (web half): auth + read-only Today — blocked on Docker

- Branch `worktree-agent-a8b446ac93ca02865`, rebased on main (`5dddb3f`), worktree at `.claude/worktrees/agent-a8b446ac93ca02865`.
- What's there: sign-in, sign-up, `/auth/callback`, route protection, onboarding redirect behind `NEXT_PUBLIC_ONBOARDING_ENABLED` (P-6), `lib/data` (Today queries), `lib/analytics`, `lib/time`, Today components, e2e specs. Typecheck and 268 unit tests pass.
- Still to do: fix 1 lint error (`Date.now()` in `app/(app)/today/page.tsx:31`, react-hooks/purity); finish `tests/e2e/helpers/` using `lib/domain/mobile` builders; run e2e. That needs `supabase start` (GoTrue), so Docker Desktop must work. In the worktree set `project_id = "salin-web-wt"` and ports +1000 in `supabase/config.toml` locally (don't commit), and pin `supabase/.temp/postgres-version` to `17.6.1.147`.
- Then: PM review, merge, `supabase stop`.
- Also once Docker works: regenerate `lib/database.types.ts` (ticket 7 hand-edited it).

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

- **Database (P-7, Oct 11):** native Homebrew `postgresql@17` on port 5433 with pgTAP 1.3.3 (built from source). `npm run db:reset` and `npm run db:test` replace `supabase db reset` / `supabase test db`; use `SALIN_DB=<name>` for a per-agent database instead of shifted Supabase ports. All 346 pgTAP pass there. Docker is only needed for GoTrue/PostgREST (ticket 3 e2e).

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
