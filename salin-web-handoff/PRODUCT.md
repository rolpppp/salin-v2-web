# Product: Salin Web

## One line

Salin Web is the planning half of Salin: the phone captures spending, the web decides where every peso goes.

## The problem

The Salin mobile app answers "what can I still safely spend?" well, but users stop opening it: logging spending costs effort and returns little. The owner (Rolf) runs his real system in a Google Sheet instead, because the sheet does what the app can't: split every payday into buckets by a plan, track money across AUD and PHP accounts, tell him what to move where, and show goals filling up.

Salin Web brings that system to every Salin user, on the same database, and makes logging pay off at two moments people already care about: **payday** and **the end of the week**.

## Users

- **Primary:** young Filipino professionals and freelancers managing their own money, often with irregular or foreign-currency income (e.g. paid in AUD, spending in PHP), several accounts (MariBank, GCash, Maya, Tonik, Pag-IBIG MP2) and a personal split plan. Rolf is the reference user.
- **Secondary:** students budgeting an allowance or a scholarship stipend (e.g. DOST).
- **Context:** they log daily spending on mobile. They open the web when money comes in and once a week to review. Desktop-first, but every screen works on a phone browser.

## What it does

1. **Money in.** Income from any source (salary, scholarship, side hustle, allowance, gift, refund, other) waits in one queue. Each source has a rule, so each income arrives already knowing its job: split by the plan, its own split, kept whole in one bucket, or "ask me". The user checks and confirms, then ticks off a short transfer checklist that tells them exactly what to send between their real accounts.
2. **Buckets.** Money lives in buckets (Living, Fun, Emergency fund, Investments, Sinking funds, Tax, Buffer, Rent, Scholarship), each kept in a real account. Today shows what's left in each, grouped as Spend / Save & grow / Set aside, plus one number: **safe to spend** until next payday.
3. **Plans.** A Plan A / Plan B split with rules: switch to Plan B when the Emergency fund reaches its target; Rent's share goes to Emergency until rent starts. Users manage income sources, accounts, categories (each inside a bucket) and goals.
4. **Weekly review.** Five minutes: look back, fix one thing, close the week, start Monday fresh.
5. **Onboarding.** About three minutes, two paths (new to Salin, or already on the Salin app). Three questions turn into a suggested plan showing the user's own pay split live; they adjust it, pick where each bucket lives, and finish by giving their real latest pay a job. Anyone can skip the plan and just track.
6. **Log spending on the web.** A five-second sheet from Today, so web-only users get the full loop and phone users can log at a desk.

## Principles

1. **Every peso has a job.** The interface always shows where money is and what it's for.
2. **Pay off the log.** Each logged entry visibly changes something the user cares about.
3. **Honest numbers.** Never round away a shortfall, invent a win or rewrite history.
4. **Two rituals, not a dashboard habit.** Money in and the weekly review are the reasons to open the web.
5. **Calm by default.** Motion and emphasis are spent only on real progress.

Brand rules from the mobile app still apply: Calm, Honest, Personal, Modern, Timeless. "No artificial achievements. No manipulation."

## Retention model

Rewards follow cognitive-psychology mechanisms, all tied to real money events:

| Mechanism | Where it shows up |
|---|---|
| Endowed progress | The week loop starts with the last real payday already ticked ("1 of 5 done") |
| Goal gradient | Goals show amount to go, 25/50/75% marks, "Passed 25% today" when a split crosses one |
| Open loops (Zeigarnik) | Today's "This week" checklist and a single next step |
| Hick's law | One primary action per screen |
| Chunking | Eight buckets shown as three groups |
| Peak-end | Completion cards when all money in is sent, and when the week closes |
| Fresh start | "Week closed. Monday starts fresh." |
| No loss framing | Overspending is a coral "Needs ₱X", never red shame |
| Ownership (IKEA effect) | The first plan is built from the user's own pay, bills and priority, and every share is theirs to change |
| Visible progress | The onboarding plan slip prints a line per answer; empty lines wait as dots |
| Defaults, not decisions | Suggested plan, suggested account homes, auto-sorted categories; the user only checks what we weren't sure about |
| Implementation intention | Onboarding ends on the next payday date and a reminder ("On Wednesday, Oct 21, add your pay…") |
| Early real win | Onboarding finishes by splitting the user's actual latest pay, then shows their buckets filling |

## Success

- The owner retires his Google Sheet for one full month.
- Week-4 retention of users with a plan beats users without one (baseline measured in Phase 0).
- Most income gets a job within 48 hours of landing; most weeks get closed.
- Most new users finish onboarding, and most of those give a real pay a job in their first week.

## Out of scope for v1

Net worth tab (Phase 2), live FX rates (Phase 2), Quick Add AI on web (later), editing confirmed paydays (open decision), bank connections.

## Facts from the owner's sheet (use as real data and golden tests)

- Plan A / Plan B: Tax set-aside 6/6, Living 7/7, Rent 2/2, Emergency fund 30/10, Investments 30/50, Sinking funds 10/10, Fun money 10/10, Buffer 5/5 (%).
- Plan A runs until the Emergency fund reaches ₱50,000. Rent starts Jan 1, 2027; before that, Rent's share goes to the Emergency fund. Rent is ₱2,000/month.
- The DOST stipend is kept whole (never split) for rent and school.
- Accounts: AUD account, MariBank (Tax, Rent, Emergency, Buffer), GCash / cash (Living), Pag-IBIG MP2 (Investments), Tonik Solo Stash (Sinking), GCash or Maya (Fun).
- Goals: Emergency fund ₱50,000; PC Build ₱65,000 (fed by half of Sinking funds); School ₱15,000; Health ₱5,000; Gifts ₱5,000.
- Oct 7, 2026: Work income A$400 → ₱17,329. Oct 8: ₱23,000 from Others. A$ received 500, transferred 400, so A$100 retained.
- Tax set-aside is for the BIR 8% option, filed quarterly.
