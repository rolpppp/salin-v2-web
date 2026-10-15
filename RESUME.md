# Resume: Salin Web build

Last updated Oct 16, 2026 (~02:30): tickets 21–35 built and **deployed**: owner pushed migrations `20261012000400`–`20261016000100` to live (verified from `~/salin-live-deploy/live_now_oct16.sql`) and pushed `main` (eeb3d87, incl. the site icon) to Vercel. Next: check the live site (landing, sign-up → Welcome, tour, sort card), `NEXT_PUBLIC_ONBOARDING_ENABLED=true` on Vercel, one real-phone sync + Postgres WARNING check. Start a new session by reading this file, then `docs/pm/BOARD.md`.

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

Build complete (Oct 12). Tickets 1–20 merged (4 is web half only); e2e 388 pass / 4 viewport skips / 0 fail; types regenerated. Every golden case (G1–G12, O1–O6) is covered. See `docs/pm/BOARD.md` for commits and follow-ups.

Checks on main: `npm run lint`, `npm run typecheck`, `npm test` (890), `npm run build`, `npm run db:reset && npm run db:test` (1107 pgTAP), `npm run test:parity` (8 suites; run it with the same `SALIN_DB` you just reset), `npm run test:mobile-compat` (83; set `SALIN_MOBILE_PATH=/Volumes/RolfStuffs/Developer/salin-v2` when run from a worktree).

## Running e2e

1. Docker Desktop running (it works again as of Oct 12, session 4).
2. `supabase start -x edge-runtime,logflare,vector,imgproxy,studio,mailpit,storage-api,postgres-meta` with `supabase/.temp/postgres-version` = `17.6.1.147`. After migration changes: `supabase db reset --local`.
3. `.env.test.local` from `supabase status -o env` (URL, anon key, service-role key; local only).
4. `npx playwright test` (all 4 projects, ~4 min). Let Playwright start the server; parallel agents need their own `E2E_PORT` and must never `pkill` broadly.

## Next waves (after the above)

- **Waves 3, 4, 5a and 5b:** done. Wave 5b: 15 (6e5b05f), 20 (9a9ea9b), 18 UI (1a73ec9).
- **E2E wave:** done (see BOARD.md "E2E + verification").
- **Ticket 21 (forgot/reset password, owner request):** done; needs live dashboard config (BOARD row 21).
- **Next (owner-side):** deploy, migrations-to-live plan (D-16, P-5, Realtime), real-device sync, 4 weeks of owner-only use (Phase 1 gate).
- **Contracts:** `lib/onboarding/draft.ts` and `step.ts` (P-8); the shell extends them with `lib/onboarding/shell-types.ts`.
- **Known follow-ups:**
  - Ticket 18: the email reminder is stored but nothing sends it yet.
  - `onb_*` helpers are exposed as RPCs (invoker rights, RLS holds); move to a private schema.
  - Add income lost its blur-time error; reserve space for `.error` in `components/field`, then restore.
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
| Finished agents, reported | ~4.54M tokens (ticket 21 ~123K; Wave 1 ~537K, Waves 2–3 ~1.21M, Wave 4 ~813K, Wave 5a ~817K, Wave 5b ~627K, e2e ~407K) |
| Stopped agents (2), from transcripts | ~275K fresh input, ~5.4M cache reads |
| Cache reads, all 6 agents | ~13M |
| Agents | 25 Sonnet agents finished (+3 stopped at launch) |

Opus PM usage is not reported per turn. Per-agent detail is in `docs/pm/USAGE.md`.
