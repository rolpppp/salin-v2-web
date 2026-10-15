/**
 * Simple Money pace (ticket 28, P-11). Pure: days are `YYYY-MM-DD` strings in the user's zone, money is integer
 * centavos. The money itself is never computed here: `spendableLeftMinor` is Σ left over the Spend group
 * (BR §4.4, the same number as safe to spend), handed in by the loader.
 *
 *   pace            = floor(spendableLeft / daysUntil)             (daysUntil is at least 1)
 *   pace at dawn    = floor((spendableLeft + spentToday) / days)   (what today started with)
 *   left today      = pace at dawn - spentToday
 *
 * Underspending rolls forward by itself (tomorrow's pace rises), overspending lowers it. Negatives are kept:
 * the screen shows them in coral ("₱X over, tomorrow adjusts"). Floors are toward minus infinity, so a
 * shortfall is never rounded away.
 */
import { addDays, dayNumber, daysBetween, floorDiv, assertMinor } from "./core";
import { zonedParts } from "../time";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const weekdayOf = (iso: string): number => new Date(dayNumber(iso) * 86_400_000).getUTCDay();

/** `2026-10-19` -> `Mon`. */
export const weekdayShort = (iso: string): string => WEEKDAY_SHORT[weekdayOf(iso)];
/** `2026-10-19` -> `Mon, Oct 19`. */
export const dayWithWeekday = (iso: string): string => `${weekdayShort(iso)}, ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** The calendar day of an instant in the user's zone (midnight is the zone's, not UTC's). */
export function dayIn(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Sums amounts per calendar day in the zone. */
export function spendByDay(entries: ReadonlyArray<{ occurredAt: number; amountMinor: number }>, tz: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    assertMinor(e.amountMinor, "amount");
    const d = dayIn(e.occurredAt, tz);
    out[d] = (out[d] ?? 0) + e.amountMinor;
  }
  return out;
}

export type UntilSource = "chosen" | "payday" | "week-end";

/**
 * The day the spending money must last until; that day is NOT counted (it is when the next money arrives).
 * Order: the chosen day if it is today or later, else the next payday if it is today or later, else the start of
 * the next week (so "end of this week" means: lasts through the last day of this week).
 */
export function resolveUntil(input: { today: string; spendUntil: string | null; nextPayday: string | null; weekStart: string }): { day: string; source: UntilSource } {
  const { today, spendUntil, nextPayday, weekStart } = input;
  if (spendUntil && daysBetween(today, spendUntil) >= 0) return { day: spendUntil, source: "chosen" };
  if (nextPayday && daysBetween(today, nextPayday) >= 0) return { day: nextPayday, source: "payday" };
  return { day: addDays(weekStart, 7), source: "week-end" };
}

/** Whole days from today to the until day, never below 1 (until today means all of it is for today). */
export function daysUntilDay(today: string, until: string): number {
  return Math.max(1, daysBetween(today, until));
}

export interface PaceInput {
  /** Σ left over the Spend group right now (after today's spending). May be negative. */
  spendableLeftMinor: number;
  /** Spent today out of the Spend group. */
  spentTodayMinor: number;
  daysUntil: number;
}

export interface PaceResult {
  /** floor(spendableLeft / days): what each remaining day gets from now. */
  paceMinor: number;
  /** What today started with: floor((spendableLeft + spentToday) / days). */
  startOfDayMinor: number;
  /** startOfDay - spentToday. Negative means over. */
  todayLeftMinor: number;
}

export function pace(input: PaceInput): PaceResult {
  const { spendableLeftMinor, spentTodayMinor, daysUntil } = input;
  assertMinor(spendableLeftMinor, "spendableLeft");
  assertMinor(spentTodayMinor, "spentToday");
  if (!Number.isSafeInteger(daysUntil)) throw new RangeError("daysUntil must be an integer");
  const days = Math.max(1, daysUntil);
  const startOfDayMinor = floorDiv(spendableLeftMinor + spentTodayMinor, days);
  return { paceMinor: floorDiv(spendableLeftMinor, days), startOfDayMinor, todayLeftMinor: startOfDayMinor - spentTodayMinor };
}

/** Days from `today` to the end of the week that starts on `weekStart`, today included (1 to 7). */
export function daysLeftInWeek(weekStart: string, today: string): number {
  const gone = daysBetween(weekStart, today);
  if (gone < 0 || gone > 6) throw new RangeError("today is not in that week");
  return 7 - gone;
}

/**
 * Left this week = min(spendableLeft, pace × days remaining in the week, today included).
 * When the money is already negative the week has nothing left: the shortfall is shown as is.
 */
export function weekLeft(input: { weekStart: string; today: string; spendableLeftMinor: number; daysUntil: number }): number {
  const { spendableLeftMinor } = input;
  if (spendableLeftMinor <= 0) return spendableLeftMinor;
  const { paceMinor } = pace({ spendableLeftMinor, spentTodayMinor: 0, daysUntil: input.daysUntil });
  return Math.min(spendableLeftMinor, paceMinor * daysLeftInWeek(input.weekStart, input.today));
}

export interface WeekDay {
  day: string;
  label: string;
  state: "past" | "today" | "future";
  spentMinor: number;
  /** today: what is left today; a future day before the until day: the current pace; else null. */
  leftMinor: number | null;
}

/**
 * The seven days from `weekStart`. Past days carry what was spent, today carries left today, future days carry the
 * current pace, except the until day and later (the next money arrives then, so nothing is planned): null.
 */
export function weekStrip(input: {
  weekStart: string;
  today: string;
  spentByDay: Readonly<Record<string, number>>;
  spendableLeftMinor: number;
  daysUntil: number;
}): WeekDay[] {
  const { weekStart, today, spentByDay, spendableLeftMinor, daysUntil } = input;
  const spentToday = spentByDay[today] ?? 0;
  const p = pace({ spendableLeftMinor, spentTodayMinor: spentToday, daysUntil });
  const days = Math.max(1, daysUntil);
  const out: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const offset = daysBetween(today, day);
    const state: WeekDay["state"] = offset < 0 ? "past" : offset === 0 ? "today" : "future";
    out.push({
      day,
      label: weekdayShort(day),
      state,
      spentMinor: spentByDay[day] ?? 0,
      leftMinor: state === "today" ? p.todayLeftMinor : state === "future" && offset < days ? p.paceMinor : null,
    });
  }
  return out;
}

export const STREAK_MILESTONES = [3, 7, 14, 30] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

export interface StreakResult {
  days: number;
  /** Today has a logged spend or a no-spend mark. */
  todayDone: boolean;
  noSpendToday: boolean;
  /** Set only on the day the streak reaches 3, 7, 14 or 30 (today done), so a reward fires once per milestone. */
  milestone: StreakMilestone | null;
}

/**
 * Consecutive days with at least one logged spend or a no-spend mark, counting back from today, or from yesterday
 * while today has nothing yet (so a streak is never "broken" before the day ends).
 */
export function streak(input: { today: string; spendDays: Iterable<string>; noSpendDays: Iterable<string> }): StreakResult {
  const spend = new Set(input.spendDays);
  const noSpend = new Set(input.noSpendDays);
  const done = (d: string) => spend.has(d) || noSpend.has(d);
  const todayDone = done(input.today);
  let cursor = todayDone ? input.today : addDays(input.today, -1);
  let days = 0;
  while (done(cursor)) {
    days++;
    cursor = addDays(cursor, -1);
  }
  const milestone = todayDone ? (STREAK_MILESTONES.find((m) => m === days) ?? null) : null;
  return { days, todayDone, noSpendToday: noSpend.has(input.today), milestone };
}
