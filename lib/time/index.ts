/** Time helpers. All timestamps are integer milliseconds since the epoch (UTC), as mobile stores them. */

export const DEFAULT_TIME_ZONE = "Asia/Manila";
export const TZ_COOKIE = "salin_tz";

/** Returns `tz` when it is a valid IANA zone, else the default. */
export function validTimeZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock parts of an instant in a zone. `weekday`: 0 = Sunday. */
export function zonedParts(ms: number, tz: string): Parts {
  const map: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAYS.indexOf(map.weekday),
  };
}

/** Offset (ms) of the zone from UTC at an instant. */
function offsetAt(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The instant of local midnight (00:00) on a calendar date in a zone. DST-safe. */
export function zonedMidnight(year: number, month: number, day: number, tz: string): number {
  const wall = Date.UTC(year, month - 1, day);
  let guess = wall - offsetAt(wall, tz);
  const corrected = wall - offsetAt(guess, tz);
  if (corrected !== guess) guess = corrected;
  return guess;
}

export type WeekRange = { startMs: number; endMs: number };

/**
 * The calendar week containing `nowMs`, as `[startMs, endMs)` in the user's zone.
 * `weekStartsOn`: 1 = Monday (default), 0 = Sunday (the stored `WeekStart` enum).
 * The week is 167 or 169 hours long across a DST change, never assumed to be 168.
 */
export function weekRange(nowMs: number, tz: string, weekStartsOn: 0 | 1 = 1): WeekRange {
  const p = zonedParts(nowMs, tz);
  const back = (p.weekday - weekStartsOn + 7) % 7;
  const start = new Date(Date.UTC(p.year, p.month - 1, p.day - back));
  const end = new Date(Date.UTC(p.year, p.month - 1, p.day - back + 7));
  return {
    startMs: zonedMidnight(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), tz),
    endMs: zonedMidnight(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), tz),
  };
}

export type DayPart = "morning" | "afternoon" | "evening";

/** Hour 0-23 in the user's local time. Morning 05-11, afternoon 12-17, evening otherwise. */
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** "Good morning, Rolf" or "Good morning" when there is no name. */
export function greeting(hour: number, firstName?: string | null): string {
  const name = firstName?.trim();
  return `Good ${dayPart(hour)}${name ? `, ${name}` : ""}`;
}

/** Current time in epoch ms. Server components call this rather than Date.now() (react-hooks/purity). */
export function nowMs(): number {
  return Date.now();
}
