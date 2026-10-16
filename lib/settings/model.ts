import { MAX_MINOR } from "@/lib/money/core";
import { formatPeso } from "@/lib/money/format";
import { parseMoney } from "@/lib/money/parse";

/**
 * Settings (ticket 37, P-13): the pure rules behind the page. The SQL setters (`set_income_rhythm`, `set_profile_basics`)
 * re-check all of this; these only give people the message before the round trip.
 */

export type Rhythm = "weekly" | "biweekly" | "twice" | "monthly" | "quarterly" | "semester" | "varies";
export const RHYTHMS: readonly Rhythm[] = ["weekly", "biweekly", "twice", "monthly", "quarterly", "semester", "varies"];

export const RHYTHM_OPTIONS: ReadonlyArray<{ value: Rhythm; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "twice", label: "Twice a month" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Every few months" },
  { value: "semester", label: "Each semester" },
  { value: "varies", label: "It varies" },
];

export const isRhythm = (v: unknown): v is Rhythm => typeof v === "string" && (RHYTHMS as readonly string[]).includes(v);

/** `payFrequency` has no quarterly or semester; both read as "varies" there (the real answer stays in `payRhythm`). */
export const payFrequencyOf = (r: Rhythm): "weekly" | "biweekly" | "twice" | "monthly" | "varies" => (r === "quarterly" || r === "semester" ? "varies" : r);

/** About how many days one payment has to last. "It varies" has no answer. */
const DAYS: Record<Exclude<Rhythm, "varies">, number> = { weekly: 7, biweekly: 14, twice: 15, monthly: 30, quarterly: 91, semester: 150 };

/** About how much a day, in whole centavos (floor), from the amount and how often it comes. Null when either is missing or it varies. */
export function perDayMinor(amountMinor: number | null, rhythm: Rhythm | null): number | null {
  if (amountMinor === null || rhythm === null || rhythm === "varies") return null;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;
  return Math.floor(amountMinor / DAYS[rhythm]);
}

/** "₱1,500" style without trailing .00, as the onboarding line says it. */
export const pesoText = (minor: number): string => formatPeso(minor).replace(/\.00$/, "");

export const perDayLine = (amountMinor: number | null, rhythm: Rhythm | null): string | null => {
  const d = perDayMinor(amountMinor, rhythm);
  return d === null ? null : `About ${pesoText(d)} a day.`;
};

/** The text a MoneyInput starts with for a stored amount. */
export const amountText = (minor: number | null): string => (minor === null ? "" : formatPeso(minor).slice(1).replace(/\.00$/, ""));

export type IncomeForm = { amountText: string; rhythm: Rhythm | null; next: string };
export type IncomeValue = { amountMinor: number | null; rhythm: Rhythm | null; next: string | null };

const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What the Money-coming-in card would save, or the first thing wrong with it. An empty amount, no rhythm and no date
 * each mean "not set". A date that already passed is fine only when it is the date already saved (`storedNext`).
 */
export function parseIncomeForm(f: IncomeForm, todayIso: string, storedNext: string | null): { ok: true; value: IncomeValue } | { ok: false; error: string } {
  let amountMinor: number | null = null;
  if (f.amountText.trim() !== "") {
    const r = parseMoney(f.amountText);
    if (!r.ok) {
      if (r.error === "too_large") return { ok: false, error: "That amount looks too large. Check the number of zeros." };
      if (r.error === "too_many_decimals") return { ok: false, error: "Use at most two decimal places." };
      if (r.error === "not_positive") return { ok: false, error: "Enter an amount above ₱0." };
      return { ok: false, error: "Enter an amount like 1,500." };
    }
    if (r.minor > MAX_MINOR) return { ok: false, error: "That amount looks too large. Check the number of zeros." };
    amountMinor = r.minor;
  }
  const next = f.next.trim() === "" ? null : f.next.trim();
  if (next !== null) {
    if (!isoDay.test(next)) return { ok: false, error: "Pick a date, or say you're not sure." };
    if (next < todayIso && next !== storedNext) return { ok: false, error: "Pick today or a later date, or say you're not sure." };
  }
  return { ok: true, value: { amountMinor, rhythm: f.rhythm, next } };
}

export const WEEK_START_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "0", label: "Sunday" },
] as const;

/** Review day is a weekday number, 0 = Sunday .. 6 = Saturday. Shown Monday first. */
export const REVIEW_DAY_OPTIONS: ReadonlyArray<{ value: number; label: string; long: string }> = [
  { value: 1, label: "Mon", long: "Monday" },
  { value: 2, label: "Tue", long: "Tuesday" },
  { value: 3, label: "Wed", long: "Wednesday" },
  { value: 4, label: "Thu", long: "Thursday" },
  { value: 5, label: "Fri", long: "Friday" },
  { value: 6, label: "Sat", long: "Saturday" },
  { value: 0, label: "Sun", long: "Sunday" },
];

export type BasicsValue = { firstName: string | null; weekStartsOn: 0 | 1; reviewDay: number };

/** The About-you name: trimmed, empty means none, 60 letters at most (the SQL limit). */
export function cleanName(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = raw.trim();
  if (v.length > 60) return { ok: false, error: "Keep your name to 60 letters or fewer." };
  return { ok: true, value: v === "" ? null : v };
}
