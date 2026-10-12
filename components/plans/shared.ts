/** Small pure helpers shared by the Split plan and Income screens. */
import { hueVar } from "@/lib/data/hues";

/** Whole-percent text from an input -> a number 0..100, or null when it isn't one. Empty counts as 0 only if allowed. */
export function parsePercent(raw: string, emptyIsZero = false): number | null {
  const s = raw.trim();
  if (s === "") return emptyIsZero ? 0 : null;
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n <= 100 ? n : null;
}

/** Basis points <-> the whole percent shown in the UI. Plan and split percentages are stored as whole-percent bp. */
export const bpToPercent = (bp: number): number => Math.round(bp / 100);
export const percentToBp = (pct: number): number => pct * 100;

/** CSS colour for a bucket hue (the --b-* tokens, incl. custom c1..c8); neutral for anything unknown. */
export function hueColor(hue: string | null | undefined): string {
  return hueVar(hue, "var(--ink-3)");
}

/** Centavos -> the text for an amount field: `5000000` -> `50,000`, `5000050` -> `50,000.50`. Integer maths only. */
export function minorToInput(minor: number): string {
  const pesos = Math.floor(minor / 100);
  const cents = minor - pesos * 100;
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents === 0 ? grouped : `${grouped}.${String(cents).padStart(2, "0")}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** `2027-01-01` -> `January 1, 2027` without going through a Date (no time zone surprises). */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`;
}
