# Resume: Salin Web build

Last paused Oct 12, 2026 after Wave 5 (all in-scope tickets built; e2e not yet run). Start a new session by reading this file, then `docs/pm/BOARD.md`.

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

Wave 5 done (Oct 12). Tickets 1–20 are all merged (4 is web half only). What's left is verification: e2e (needs Docker), type regen, Phase 1 gate. See `docs/pm/BOARD.md` for commits and follow-ups.

Checks on main: `npm run lint`, `npm run typecheck`, `npm test` (866), `npm run build`, `npm run db:reset && npm run db:test` (1104 pgTAP), `npm run test:parity` (8 suites; run it with the same `SALIN_DB` you just reset), `npm run test:mobile-compat` (83; set `SALIN_MOBILE_PATH=/Volumes/RolfStuffs/Developer/salin-v2` when run from a worktree).

## Not verified yet (needs Docker)

- **No e2e has run since ticket 3.** Every page is behind sign-in, so `npm run e2e` needs `supabase start` (GoTrue). Specs exist for Today (G9, G10, cover, drawer), auth, Plans (all sections), Money in, transfers (G7, G8, G12), Review and Log spending. Expect selector tuning on first run.
- To run them:
  1. Get Docker's engine up. Oct 11 late: system disk had 4.4 GB free, Desktop said "running" but `~/.docker/run/docker.sock` never appeared. Try Docker Desktop → Troubleshoot → Restart, or free more space.
  2. Start Docker and `supabase start -x edge-runtime,logflare,vector,imgproxy,studio,mailpit,storage-api,postgres-meta`. Pin `supabase/.temp/postgres-version` to `17.6.1.147`.
  3. Recreate `.env.test.local` from `supabase status` (see `.env.example`).
  4. `npm run e2e`.
- `tests/e2e/helpers/` should switch to `lib/domain/mobile` builders (ticket 3 follow-up).
- Regenerate `lib/database.types.ts` with `supabase gen types` (hand-edited since ticket 7).
- PostgREST embeds in `lib/data/money-in.ts` are untested against a real server.

## Next waves (after the above)

- **Waves 3, 4, 5a and 5b:** done. Wave 5b: 15 (6e5b05f), 20 (9a9ea9b), 18 UI (1a73ec9).
- **Next:** Docker → run the whole e2e suite, regenerate `lib/database.types.ts`, Phase 1 gate.
- **Contracts:** `lib/onboarding/draft.ts` and `step.ts` (P-8); the shell extends them with `lib/onboarding/shell-types.ts`.
- **Known follow-ups:**
  - Ticket 18: the email reminder is stored but nothing sends it yet.
  - Ticket 20: Make a plan for a web user who chose Not yet has no pay amount.
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
| Finished agents, reported | ~4.01M tokens (Wave 1 ~537K, Waves 2–3 ~1.21M, Wave 4 ~813K, Wave 5a ~817K, Wave 5b ~627K) |
| Stopped agents (2), from transcripts | ~275K fresh input, ~5.4M cache reads |
| Cache reads, all 6 agents | ~13M |
| Agents | 21 Sonnet agents finished (+3 stopped at launch) |

Opus PM usage is not reported per turn. Per-agent detail is in `docs/pm/USAGE.md`.
