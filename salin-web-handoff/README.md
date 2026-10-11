# Salin Web: developer handoff

Salin Web is the planning half of Salin. The phone app captures daily spending. The web app decides where every peso goes: it splits incoming money into buckets by the user's plan, tells the user which transfers to make between their real accounts, tracks goals, and closes each week with a five-minute review.

It runs on the **same Supabase project** as the Flutter mobile app ([salin-v2](https://github.com/rolpppp/salin-v2)) and must never break mobile sync.

## Read in this order

| # | File | What it gives you |
|---|---|---|
| 1 | [AGENTS.md](AGENTS.md) | Working rules for coding agents: stack, non-negotiables, definition of done |
| 2 | [PRODUCT.md](PRODUCT.md) | Who it's for, what it does, product principles |
| 3 | [SPEC.md](SPEC.md) | Every screen and flow, with acceptance criteria |
| 4 | [BUSINESS_RULES.md](BUSINESS_RULES.md) | The money math: allocation engine, transfers and netting, safe to spend, goals, with golden tests |
| 5 | [DATA_MODEL.md](DATA_MODEL.md) | Existing mobile tables, new tables, RLS, triggers, sync compatibility |
| 6 | [DESIGN.md](DESIGN.md) | Visual system: tokens, type, components, motion, reward rules |
| 7 | [DECISIONS.md](DECISIONS.md) | What's decided, what's open, and who decides |
| 8 | [ROADMAP.md](ROADMAP.md) | Phases, gates, first tickets, success metrics |

## Reference material

- **Clickable prototype:** [Salin Web prototype](https://claude.ai/artifact/UtwdVLXkL5EzJS74xyYaTD) (private to the owner until shared). It opens on onboarding; "skip to the returning-user demo" jumps to the owner's sheet data. Its source is in [`prototype/index.html`](prototype/index.html), a single self-contained file. Treat it as the **behaviour and visual reference**, not code to port: it stores everything in memory, uses account names as ids, and labels demo data "Sample".
- **Plan doc:** [Salin Web — Plan](https://claude.ai/code/artifact/8a82cc7a-0f31-4adb-a9a6-20e4d7f4d118) (strategy, retention loop, decision table). This folder supersedes it where they differ.
- **Owner's Google Sheet ("Money Tracker")**: the system Salin Web replaces. Its real numbers are the golden tests in BUSINESS_RULES.md.
- **Mobile repo:** `lib/core/database/tables/tables.dart` (schema), `lib/core/services/sync/` (sync protocol), `lib/core/theme/app_theme.dart` (mobile tokens).

## In one paragraph

Next.js (App Router) + TypeScript web app on the existing Supabase Postgres. New users start with a three-minute **onboarding** (two paths: new to Salin, or already on the Salin app) that builds a plan from their own numbers and gives their real latest pay a job. Then four tabs: **Today** (safe to spend, one next step, bucket shelf, goals), **Money in** (waiting income from any source, each pre-assigned by its source's rule; confirm; transfer checklist), **Review** (weekly close), **Plans** (split plan, income sources, accounts, categories, goals). The allocation engine runs in Postgres so mobile and web always agree. All money is integer centavos. Rewards come only from real progress; no streaks or badges.
