import type { StreakResult } from "@/lib/money";

/**
 * Streak reminders and in-app notices (ticket 31, docs/pm/NOTIFICATIONS.md). Pure: the loader hands in today's state in the
 * user's zone; this decides which notices exist today, when each becomes due (minute of the local day), and their copy.
 * The phone app implements the same rules (salin-v2/STREAK_AND_NOTIFICATIONS.md). Copy is warm, never guilt.
 */

export type NoticeKind = "daily_log" | "streak_risk" | "money_day" | "weekly_review" | "milestone";

export interface NotifyPrefs {
  dailyLog: boolean;
  /** "HH:MM", local time. */
  dailyLogAt: string;
  streakRisk: boolean;
  moneyDay: boolean;
  weeklyReview: boolean;
  /** Browser notifications while a Salin tab is open. */
  browser: boolean;
}

export const DEFAULT_PREFS: NotifyPrefs = { dailyLog: true, dailyLogAt: "20:00", streakRisk: true, moneyDay: true, weeklyReview: true, browser: false };

export interface NotifyState {
  todayIso: string;
  /** Minutes since local midnight, now. */
  nowMinutes: number;
  /** 0 = Sunday … 6 = Saturday, today. */
  weekday: number;
  streak: StreakResult;
  /** The day the next money arrives (spendUntil, else next payday), or null. */
  moneyDay: string | null;
  /** 0 = Sunday … 6 = Saturday. */
  reviewDay: number;
  viewMode: "simple" | "full";
  prefs: NotifyPrefs;
  /** Keys already read. */
  read: ReadonlySet<string>;
}

export interface Notice {
  key: string;
  kind: NoticeKind;
  title: string;
  body: string;
  href: string;
  /** Minute of the local day it becomes due. */
  atMinutes: number;
  due: boolean;
  read: boolean;
}

export const MONEY_DAY_AT = 8 * 60;
export const REVIEW_AT = 9 * 60;
const RISK_EARLIEST = 21 * 60;
const RISK_LATEST = 22 * 60 + 30;
/** A streak this long is worth a late-evening "keep it" reminder. */
export const RISK_MIN_DAYS = 3;

/** "20:00" → 1200. Anything unreadable falls back to the default 8 PM. */
export function minutesOf(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return 20 * 60;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h < 24 && min >= 0 && min < 60 ? h * 60 + min : 20 * 60;
}

const daysWord = (n: number) => `${n}-day`;

/** Every notice that applies today, due or not yet, newest-first by due time. */
export function noticesFor(s: NotifyState): Notice[] {
  const out: Omit<Notice, "due" | "read">[] = [];
  const { streak, prefs, todayIso } = s;
  const logAt = minutesOf(prefs.dailyLogAt);

  if (streak.milestone !== null) {
    out.push({
      key: `milestone:${streak.milestone}:${todayIso}`,
      kind: "milestone",
      title: `${daysWord(streak.milestone)} streak`,
      body: `That's ${streak.milestone} days in a row of keeping your numbers true.`,
      href: "/today",
      atMinutes: 0,
    });
  }
  if (prefs.moneyDay && s.moneyDay === todayIso) {
    out.push({
      key: `money_day:${todayIso}`,
      kind: "money_day",
      title: "Money day",
      body: "More money is due today. Add what came in to get your new number.",
      href: s.viewMode === "simple" ? "/today" : "/money-in?add=1",
      atMinutes: MONEY_DAY_AT,
    });
  }
  if (prefs.weeklyReview && s.weekday === s.reviewDay) {
    out.push({
      key: `weekly_review:${todayIso}`,
      kind: "weekly_review",
      title: "Five minutes to close the week",
      body: "Look back, fix one thing, and start the week fresh.",
      href: "/review",
      atMinutes: REVIEW_AT,
    });
  }
  if (!streak.todayDone) {
    if (prefs.dailyLog) {
      out.push({
        key: `daily_log:${todayIso}`,
        kind: "daily_log",
        title: "Anything to log today?",
        body: streak.days > 0 ? `Keep your ${daysWord(streak.days)} streak going. A no-spend day counts too.` : "Log what you spent, or mark a no-spend day.",
        href: "/today",
        atMinutes: logAt,
      });
    }
    if (prefs.streakRisk && streak.days >= RISK_MIN_DAYS) {
      out.push({
        key: `streak_risk:${todayIso}`,
        kind: "streak_risk",
        title: `Keep your ${daysWord(streak.days)} streak`,
        body: "Nothing logged yet today. One entry or a no-spend day keeps it going.",
        href: "/today",
        atMinutes: Math.min(RISK_LATEST, Math.max(RISK_EARLIEST, logAt + 90)),
      });
    }
  }
  return out
    .map((n) => ({ ...n, due: n.atMinutes <= s.nowMinutes, read: s.read.has(n.key) }))
    .sort((a, b) => b.atMinutes - a.atMinutes);
}

/** What the bell shows: due notices (unread first within the same time). */
export const inbox = (all: readonly Notice[]) => all.filter((n) => n.due);
export const unreadCount = (all: readonly Notice[]) => all.filter((n) => n.due && !n.read).length;
/** What a device should schedule for later today. */
export const upcoming = (all: readonly Notice[]) => all.filter((n) => !n.due && !n.read).sort((a, b) => a.atMinutes - b.atMinutes);
