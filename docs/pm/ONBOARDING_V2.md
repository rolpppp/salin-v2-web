# Onboarding v2: for the users we have (proposal, Oct 15)

**Status: contract P-12, built locally as ticket 29 (Oct 15).** The owner said "proceed with the default", so the open questions below are answered with the defaults listed under "As built". Migration `20261015000200_onboarding_v2.sql` is **not live: owner OK needed** before `db push`.

## Why

The web onboarding was designed for someone on a salary: Income, Accounts, Priorities, Your plan, Where it lives, First pay. Two of those steps (Priorities, Your plan) are the percentage-split machinery, which doesn't fit someone living off an allowance or a stipend. Simple Money (ticket 28) added a second Today, a "make it last until" date and an "I got money" sheet. Onboarding should lead into those, not around them.

## Proposed flow

The same flow serves a student and a salaried user.

1. **Welcome.** Keep the existing question about whether the user has the phone app, since that changes where data comes from.
2. **What describes your money?** One choice that sets everything after it:
   - **Allowance or stipend:** money arrives from family or a scholarship.
   - **Salary or regular pay:** the current flow.
   - **A mix, or it varies:** gigs, commissions, or both.
3. **Accounts.** Same step as today: pick the places the money sits (MariBank, cash, GCash). One screen with chips; opening balances optional.
4. **Your money rhythm** (allowance, stipend or mix only).
   - How much do you usually get?
   - How often? Weekly, every two weeks, monthly, every few months or per semester, or "it varies".
   - When is the next one? A date, or "not sure".
   - This sets the "make it last until" date that Simple view already uses.
5. **First money in.** Type what you have right now and split it across your accounts. It is the same screen as "I got money", so the user learns the daily action during onboarding and ends on a real "₱X a day" number.
6. **Done.** Land in Simple view with the number already filled in.

## What changes by group

| | Allowance or stipend | Salary | Mix |
|---|---|---|---|
| Plan and percentages | Skipped. One *Spending* pot plus optional *Kept aside* | Kept (current flow) | Skipped by default, offered later |
| Default view | Simple | Full | Simple |
| Steps | about 5 | 6 | about 5 |
| First screen after | Today with "₱X a day" | Today with the existing payday move checklist | Today with "₱X a day" |

## Decisions (proposed; owner may overrule)

- **Plans are opt-out only for salary users.** Everyone else gets "Make a plan" in Today later (it already exists from Just track).
- **No priorities questionnaire for students.** "Build a safety net / Save for something" means little on ₱1,500 a week.
- **Wording follows the situation.** On a stipend lump the question is "How long does this need to last?", not "When is payday?".
- **Reuse, don't rebuild.** The step modules already exist. The work is a new "pattern" step, a new "rhythm" step, a swapped final step (the Simple "I got money" screen), and new defaults at finish (`viewMode`, `spendUntil`, the Spending and Kept buckets, no plan lines for non-salary). Expect one ticket for SQL plus UI, similar in size to Simple Money.

## Technical notes for the contract (to be confirmed)

- The draft (`lib/onboarding/draft.ts`) gains a `pattern` (`allowance` | `salary` | `mix`) and a `rhythm` (`amountMinor`, `frequency` including `quarterly` and `semester`, `nextDate | null`). Bump `DRAFT_VERSION`, and the SQL validates the same shape.
- `finish_onboarding` sets `viewMode = 'simple'`, `spendUntil` from the rhythm, and for non-salary patterns applies the Just-track defaults (Spending 100%, Kept aside = the Emergency bucket) instead of a suggested plan.
- The first-pay step for non-salary users calls `receive_money`, not the plan-split confirm.
- Existing golden cases O1–O6 must stay green for the salary path.
- Keep `NEXT_PUBLIC_ONBOARDING_ENABLED` as is (it is a flag from P-6; local needs it set in `.env.local`).

## As built (ticket 29)

- **Welcome is the pattern question.** Three cards (Allowance or stipend · Salary or regular pay · A mix, or it varies) replace "Have you used the Salin app?". The phone-app path stays as a quiet link, "I already use the Salin app". Q1 default: keep the app path.
- **Salary is untouched.** Its card starts the old six steps (`/welcome/income`), so golden cases O1–O6 and their e2e are unchanged.
- **Allowance and mix** are just-tracking web drafts (`skipped`, `pattern`), with three steps: Accounts · Your rhythm · First money. Cash is ticked and set as the landing account on arrival (Q3 default: yes). Your rhythm also asks for the first name (there is no Income step).
- **Draft is additive, not a version bump.** `pattern`, `rhythm` and `firstMoney` have zod defaults, so stored drafts, `"v": 1` in the SQL and the existing pgTAP drafts stay valid. `rhythm.frequency` keeps `quarterly` and `semester`; `income.frequency` gets `varies` for them.
- **Unknown next date (Q2 default):** "Not sure yet" is enough. `spendUntil` stays null and Simple view falls back to the next Monday (Monday weeks in onboarding, the profile's `weekStartsOn` afterwards).
- **First money** reuses `splitReceive` / `paceAfter` from Simple Money: the amount, per-account amounts (the landing account holds the remainder), an optional keep-aside to Emergency, and a live "About ₱X a day until {date}" with a dot per day. "Skip for now" finishes without recording money.
- **Finish (SQL):** `onb_validate_draft` accepts the new fields (next payday optional for allowance / mix; allowance / mix must be a web, just-tracking draft). `finish_onboarding` then sets `viewMode = 'simple'`, `spendUntil = rhythm.nextDate`, and records the first money through `receive_money` (job `manual`). Nothing else changes; no mobile table is touched.
- **Motion** (transform + opacity, `--ease-out`, under 450ms, reduced motion = fade): Welcome rises in with a 60–70ms stagger, the example day's bars grow from the baseline, the per-day number counts and its dots pop in one by one. The plan slip becomes a "Your money" slip for these users.
- **Checks:** 1097 unit, 1453 pgTAP (new file `96_onboarding_v2.sql`, 16 tests), e2e `onboarding-v2.spec.ts` on all four viewports; onboarding-web, onboarding-app, first-pay, smoke and simple-today e2e green (smoke and simple-today need `NEXT_PUBLIC_ONBOARDING_ENABLED=false`; the onboarding specs need it `true`).
- **Finish tour (added after review):** allowance / mix end on a "You're set" card instead of going straight to Today: the daily number, how buckets work (Spending vs Kept aside, with animated bars), the Simple / Full switch (an animated demo toggle and where it lives), and a phone-app request. Salary's Done card gets the same Simple / Full and app tiles. Components: `Tour.tsx`, `SimpleDone.tsx`.
- **Phone app by request:** `lib/app-request.ts` builds a `mailto:proj.salin@gmail.com` link (subject "Salin Android app (APK) request", name and account email filled in when known). Offered in the tour and as "Get the phone app" in the avatar menu.
- **Full Today** now ends with "Want just one number a day? Switch to simple view" (`SwitchToSimple.tsx`), mirroring Simple's "Switch to full view".
- **Follow-ups:** analytics `onboarding_completed` has no pattern prop; the Welcome example is decorative English only; "Make a plan" later for these users is the existing Today card.

## Open questions (answered above)

1. **Phone-app path.** The owner is the only real user and uses the web. Drop the "Do you have the Salin app" question for now, or keep it?
2. **Stipend with an unknown date.** Is "not sure" enough, leaving `spendUntil` unset so Simple view falls back to the end of the week? Or should onboarding ask for a rough month?
3. **Cash account.** Add a "Cash in hand" account automatically for allowance users?
