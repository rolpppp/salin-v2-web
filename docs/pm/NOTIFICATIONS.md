# Streak and reminders (ticket 31, decision P-13, Oct 15)

**Owner's choices:**
- in-app plus on-device reminders, with no push server;
- a streak day counts when spending was logged or a no-spend day was marked;
- four reminders (daily log, keep my streak, money day, weekly review), each one can be turned off;
- web now, mobile from the spec in `salin-v2/STREAK_AND_NOTIFICATIONS.md`.

## Built (web)

- **Streak everywhere.** Simple view already had it (P-11). Full Today now shows the streak chip, a note and "No spend today" under the greeting (`components/today/StreakRow.tsx`).
- **Rules:** `lib/notify/rules.ts` is pure, with Vitest tests. It decides which notices exist today, when each is due (local minute), the copy and the link. Keys are `kind:YYYY-MM-DD` (milestones add `:n`).
- **Data:** migration `20261015000400_notifications.sql`.
  - `notification_prefs`: one row per user with the four switches, `dailyLogAt` and `browser`.
  - `notification_reads`: one row per user and key.
  - RLS and pgTAP (`98_notifications.sql`, 12 tests). No mobile table is touched.
- **Bell:** `components/notify/NotificationBell.tsx`, in the header.
  - The inbox shows notices that are due today, plus a streak card.
  - Opening it marks the notices read and clears the count.
  - Reminder switches and the daily-nudge time save on change.
- **Browser reminders**, opt in with "Show in this browser":
  - they ask for permission, register `public/sw.js` (show and click only, no caching, no push), and schedule the rest of today's reminders while a tab is open;
  - each one is re-checked with the server just before it shows (`checkNotice`), so nothing nags about a day that already counts;
  - a key shows only once across tabs.
  - **Limit:** with no push server, nothing pops while every Salin tab is closed. The phone app covers that.
- **Loader:** `lib/data/notify.ts`, cached per request, used by the layout (bell) and Today (streak). On failure it returns null and the bell just hides.
- **Analytics:** `notify_prefs_changed`.

## Live rollout

Migration `20261015000400` needs the owner's OK and a `db push`. Until then the bell won't show (the loader fails quietly), and Full view's streak row won't render.

## Follow-ups

- Server push (Web Push or FCM) for closed-tab reminders.
- Milestone burst in Full view (Simple has it).
- `notification_reads` cleanup after 30 days.
- Add `day_checkins` and `notification_prefs` to the realtime publication, so another device's no-spend mark updates live.
