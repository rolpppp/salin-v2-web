# Salin Web

The spec lives in `salin-web-handoff/`. Read `salin-web-handoff/AGENTS.md` before writing code; it wins over habits. Money rules: `BUSINESS_RULES.md`. Schema: `DATA_MODEL.md`. Decisions (incl. Oct 11 kickoff answers): `DECISIONS.md`. Visual/behaviour reference: `salin-web-handoff/prototype/index.html`.

Hard rules (short version):
- Money is integer centavos everywhere. No floats.
- Never alter the 12 mobile-synced tables. camelCase columns, integer enums in Dart order.
- Develop only against local Supabase (`supabase start`). Never run anything that writes to the linked live project (`--linked`, `db push`, remote migrations).
- RLS + pgTAP for every new table.
- Pin exact dependency versions (`npm install --save-exact`).

Commands (once scaffolded): `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test` (Vitest), `npm run e2e` (Playwright), `supabase test db` (pgTAP).

Resuming a paused build? Read `RESUME.md` first.

Project tracking: `docs/pm/BOARD.md` (tickets, owners, status) and `docs/pm/USAGE.md` (agent token ledger).
