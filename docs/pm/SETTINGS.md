# Settings: change what you set in onboarding (ticket 37, owner request Oct 16)

The owner: "I want to have an option to edit or modify my settings like my weekly income, my bucket. I want to be in control. Right now, if you have set it, you have no way to edit it."

What is wrong today:

- **Income rhythm is lost.** Onboarding asks how much you usually get, how often, and when it next comes (`draft.rhythm` on the allowance path, `draft.income` on the web/app paths). `finish_onboarding` keeps only `payFrequency` (quarterly/semester collapse to `varies`) and `nextPaydayDate`, then wipes the draft. The amount is stored nowhere. Nothing lets you change any of it.
- **No settings page.** The avatar menu's "Account" item is a TODO and does nothing. First name, week start, review day, view mode and the kept-aside bucket (`keepBucketId`, Simple view) have no editor.
- **Buckets and split are hard to reach.** Plans → Split plan can already rename/recolour/add/archive buckets and change percentages (ticket 26), but a just-tracking user (allowance path, `planMode = 'track'`) may hit the "No split plan yet" dead end there. Verify and fix.

Owner answers (Oct 16): a new **Settings page** opened from the avatar menu; for buckets they want all three: the kept-aside bucket, bucket names/colours, and split percentages (the last two may stay in Plans → Split plan, linked from Settings, as long as every user can reach them).

## Decisions (P-13)

1. **Route** `/settings` in the `(app)` group (signed-in, onboarded). Avatar menu "Account" becomes **Settings** and links there (both views). No new tab in the main nav.
2. **Store the rhythm.** `user_profiles` (web table, not mobile-synced) gains `"payAmountMinor" bigint null check ("payAmountMinor" > 0 and "payAmountMinor" <= 1000000000)` and `"payRhythm" text null check ("payRhythm" in ('weekly','biweekly','twice','monthly','quarterly','semester','varies'))`. `payFrequency` stays and is kept in sync (quarterly/semester → `varies`, same mapping as `lib/onboarding/simple-path.ts`). Existing users start with nulls; Settings shows "Not set yet" and lets them fill it in. No backfill is possible (the draft is gone).
3. **Finish onboarding saves them.** `finish_onboarding` writes `payAmountMinor` / `payRhythm` from the draft (allowance path: `rhythm.amountMinor` / `rhythm.frequency`; other paths: `income.amountMinor` / `income.frequency`). Do it with `create or replace` in the new migration, copying the current body (from `20261015000200_onboarding_v2.sql`) and changing only the profile insert/update. Nothing else in the function changes.
4. **One "next money" date.** Settings shows a single *Next money arrives* date. Saving it sets `nextPaydayDate`, and also `spendUntil` when `spendUntil` is not null (Simple view's "make it last until" reads `spendUntil` first, so otherwise the change would do nothing). Clearing it ("Not sure") sets both to null. The hero's own until picker keeps writing `spendUntil` only.
5. **Changes apply from now on** (AGENTS §3.4). Nothing already received, allocated, ticked or closed is recomputed. Say so once on the page: "Changes apply from now on. Money you already got keeps how it was split."
6. **Week start.** Changing `weekStartsOn` must not rewrite closed weeks. Before building, read `20261011001401_review.sql`, `lib/data/review.ts`, `lib/data/today*.ts`, `lib/data/simple-today.ts` and confirm what happens to the current open week and closed weeks after a change. If closing a week or the Review badge breaks or double-counts, fix it in SQL with a pgTAP case; if it can't be made safe cheaply, stop and report to the PM instead of guessing.
7. **No dead settings.** Don't show the payday email reminder (nothing sends it yet, ticket 18 follow-up). Don't show currency (PHP only).

## SQL (new migration `20261016000200_settings.sql`; SECURITY INVOKER, `assert_self`, `P0001` with a user-facing message on refusal, `22023` on bad input)

| Function | Behaviour |
|---|---|
| `set_income_rhythm(p_amount bigint, p_rhythm text, p_next date)` | any arg may be null (= not set). Validates range/enum. Writes `payAmountMinor`, `payRhythm`, `payFrequency` (mapped), `nextPaydayDate`, and `spendUntil` per decision 4. `p_next` before today raises `22023` ("Pick today or a later date"). |
| `set_profile_basics(p_first_name text, p_week_starts_on int, p_review_day int)` | trims name (empty → null, ≤ 60 chars), `weekStartsOn` in (0,1), `reviewDay` 0..6. |
| `finish_onboarding` | redefined per decision 3. |

`set_view_mode` and `set_keep_bucket` already exist (ticket 28): reuse them. pgTAP (`supabase/tests/`): each setter happy path, each refusal, user B can't change user A's profile, finish_onboarding stores amount + rhythm for the allowance path (quarterly stays quarterly in `payRhythm`, `varies` in `payFrequency`) and for the web path, the week-start case from decision 6. Existing suites stay green.

Regenerate or hand-edit `lib/database.types.ts` for the new columns/functions.

## Data and actions

- `lib/data/settings.ts`: `getSettingsData(supabase, userId)` → `{ firstName, weekStartsOn, reviewDay, viewMode, pay: { amountMinor, rhythm, nextDate }, spendUntil, keepBucketId, buckets: Array<{ id, name, hue, groupKey, isArchived, sharePercentBp | null }>, activePlanName | null, planMode }`. Batch the reads (ticket 23: one wave, no sequential hops).
- `lib/actions/settings.ts`: `saveIncomeRhythm`, `saveProfileBasics` (Zod at the boundary, `ActionResult` like the others, revalidate `/settings`, `/today`, `/review`). Reuse `setViewMode` / `setKeepBucket` from `lib/actions/simple.ts`. Analytics event `settings_changed` with the section name only (no amounts).
- Vitest for the mapping and validation.

## UI (read `salin-web-handoff/DESIGN.md` first; reuse `components/*`, the onboarding Rhythm step's inputs and copy where they fit)

Page title **Settings**, lede "What you set up when you started. Change it any time." One column, cards, each section saves on its own (one **Save** per card, disabled until something changed, shows "Saved" briefly; a failed save keeps the typed values and shows the error).

1. **Money coming in.** About how much (`MoneyInput`), How often (chips: Weekly · Every 2 weeks · Twice a month · Monthly · Every few months · Each semester · It varies), Next money arrives (date, plus "Not sure"). Live line under it, same as onboarding: "About ₱X a day." Then the from-now-on note.
2. **Your week.** Week starts on (Monday · Sunday), Review day (7 chips). Hide Review day in Simple view (Simple has no Review loop).
3. **Your buckets.**
   - *Kept aside goes to*: a picker of live, non-archived buckets outside the Spend group (`set_keep_bucket`). Show in both views.
   - A compact list of live buckets: colour dot, name, and its share in the active plan (or nothing for planless/no plan).
   - Link button **Edit buckets and split** → `/plans/split`.
4. **About you.** First name.
5. **View.** Simple · Full (segmented control, `setViewMode`, then `router.refresh()`).

**Plans → Split plan for a just-tracking user.** Log in as a user who finished the allowance path and open `/plans/split`. Every user must be able to rename/recolour/add/archive buckets there and set split percentages. If they hit "No split plan yet", replace that dead end: always render the buckets section, and offer to start a plan from scratch (Plans v2 `createPlan` with no lines, see `docs/pm/PLANS_V2.md`). Don't change what a just-tracking user's "I got money" does.

Accessibility: labels on every input, 44px targets, visible focus, AA in light and dark, 390px with no horizontal scroll.

## Tests to leave green

lint, typecheck, `npm test`, build, `npm run db:reset && npm run db:test`, `npm run test:parity`, `npm run test:mobile-compat`. New Playwright spec `tests/e2e/settings.spec.ts`: edit rhythm (amount + Every few months + a date) → reload shows the values, and Simple Today's until line uses the new date; change kept-aside bucket; change week start; view toggle round trip from Settings; avatar menu → Settings; a just-tracking user can rename a bucket and set split percentages from the Edit buckets link; 390px. Existing e2e must pass untouched (known flake: `transfers.spec.ts:119`).
