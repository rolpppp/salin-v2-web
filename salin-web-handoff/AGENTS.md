# AGENTS.md: how to work on Salin Web

Instructions for coding agents (and humans) building Salin Web. Read this file fully before writing code. When a rule here conflicts with a habit, this file wins. When it conflicts with the owner's explicit instruction, the owner wins.

## 1. What you are building

A Next.js web app that shares one Supabase project with the Flutter mobile app `salin-v2`. Mobile is local-first (Drift/SQLite) and syncs to Supabase only when the user turns sync on. The web app reads and writes Supabase directly.

Start with PRODUCT.md, then SPEC.md (onboarding is §7, web spending log §8), then BUSINESS_RULES.md. Do not guess money rules; if BUSINESS_RULES.md doesn't answer it, check DECISIONS.md, then ask.

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), React Server Components where data is read, Server Actions for writes |
| Language | TypeScript, `strict: true`, no `any` in domain code |
| Data | Supabase Postgres via `@supabase/ssr`; types generated with `supabase gen types` |
| Business logic | Postgres functions for allocation and anything both apps must agree on; pure TS mirrors only for previews |
| Styling | CSS custom properties from DESIGN.md as the token layer; Tailwind mapped to those variables; headless primitives (Radix or similar) restyled, never stock |
| Validation | Zod at every boundary (forms, server actions, route handlers) |
| Tests | Vitest (unit), Playwright (e2e, 390px and 1440px, light and dark), pgTAP (SQL functions, RLS) |
| Analytics | PostHog (or a Supabase `events` table) from Phase 0 |
| Hosting | Vercel; Supabase Edge Functions + pg_cron for scheduled jobs |

Pin exact dependency versions. Keep the Gemini key server-side if Quick Add ever comes to web.

## 3. Non-negotiables

**Money**
1. Every amount is an integer in **centavos** (`*_minor`, `bigint` in SQL, `number` checked with `Number.isSafeInteger` in TS). No floats for money, anywhere, ever. Percentages are integers (whole percent) or basis points.
2. Splits must sum exactly to the input amount. The remainder rule is in BUSINESS_RULES.md §2.4. Every split function has a test proving `sum(parts) === total`.
3. Format with the shared formatter only: `₱17,329.00`, minus sign `−` (U+2212), tabular figures. Never round away a shortfall.

**History is never rewritten**
4. Plan changes, "kept in" account changes and category moves apply to **future** money only. Store snapshots (plan used, percentages, destination account per bucket, bucket per spending entry) at the moment money is confirmed or logged. Never recompute the past from current settings.
5. Ticking a transfer as sent stores the **amount sent**. If the suggested amount later changes, show the difference ("Send ₱X more"); never silently mark a different amount as done.

**Mobile sync compatibility**
6. Do not rename, drop or retype columns on the 12 tables mobile syncs (see DATA_MODEL.md §1). Mobile writes them with **camelCase JSON keys**; the web must read and write the same keys.
7. Existing enums are **integers whose meaning is the Dart enum order**. Use the shared enum map in DATA_MODEL.md §1.3. Never reorder. New enums are `text`.
8. Every table gets the server-time `updatedAt` trigger (DATA_MODEL.md §4); on the 12 synced tables it ships together with the mobile pull fix in DECISIONS.md D-16. The web never sets `updatedAt` itself.
9. Soft delete only (`deletedAt`). Never hard-delete rows mobile might sync.

**Security**
10. RLS on every table: `user_id = auth.uid()`. Write a pgTAP test per table proving another user can't read or write. No service-role key in the browser.
11. Treat user-typed names as untrusted: escape on output, validate length on input.

**Honesty (product rule, not style)**
12. No streaks, badges, points, confetti for routine actions, guilt copy or fake urgency. Celebrations fire only when a real loop completes (all money in has a job and is sent; week closed). See DESIGN.md "Reward system".
13. Never show made-up numbers. The prototype's "Sample" data does not ship. Empty states explain how to add the first real item.
14. Show the truth when it's uncomfortable: overspending is shown (coral "Needs ₱X"), never hidden.

## 4. Code organisation (suggested)

```
app/                    routes: (app)/today, (app)/money-in, (app)/review, (app)/plans/[section]
components/             UI components, one folder per DESIGN.md component
lib/money/              format, parse, split helpers (pure, fully tested)
lib/domain/             typed domain models + mappers from Supabase rows (camelCase-aware)
lib/data/               queries and server actions
supabase/migrations/    SQL migrations (schema, RLS, triggers, functions)
supabase/tests/         pgTAP tests
tests/                  Vitest unit + Playwright e2e
```

Business rules live in `supabase/migrations` (SQL functions) and `lib/money`, never inside components.

## 5. UI rules

- Follow DESIGN.md exactly: tokens, type ramp, components, motion budgets, reduced-motion fallbacks, both themes.
- One primary button per screen state. When the Add income form is open, it owns the primary.
- Every interactive element: hover, focus-visible, active, disabled, loading, error. Keyboard reachable. After an action that re-renders, put focus somewhere sensible (SPEC.md notes where).
- Announce important state changes through a polite live region (the prototype's `#live` pattern).
- Responsive: designed at 1440, must work at 390 with no horizontal page scroll. Breakpoints 1100 / 860 / 720 (DESIGN.md).
- Copy: plain, specific, from the user's side. Controls name their action. Errors say what's wrong and how to fix it.

## 6. Definition of done (per ticket)

- [ ] Behaviour matches SPEC.md acceptance criteria and the prototype where SPEC.md is silent.
- [ ] Money logic covered by unit tests, including the golden tests in BUSINESS_RULES.md §10 and §12.8 that apply.
- [ ] New tables have RLS + pgTAP tests; new synced columns don't break mobile (run mobile sync against a branch DB if you touched shared tables).
- [ ] Playwright e2e at 390px and 1440px, light and dark; no console errors; no horizontal overflow.
- [ ] Keyboard-only pass and reduced-motion pass.
- [ ] Analytics events from ROADMAP.md §4 fire where relevant.
- [ ] No hard-coded user data, no "Sample" content.

## 7. When unsure

- A money or data rule is ambiguous → stop and ask; record the answer in DECISIONS.md.
- A design detail is missing → follow DESIGN.md rules, then the prototype; note the gap in the PR.
- Something here is wrong → fix this file in the same PR and say so.
