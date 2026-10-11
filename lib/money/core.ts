/**
 * Core integer helpers for the money engine (reference implementation).
 *
 * Rules:
 *  - Every amount is an integer number of centavos (`Minor`), checked with Number.isSafeInteger.
 *  - Percentages are basis points (`Bp`): 100% = 10_000.
 *  - Rounding is half up on the exact rational value (ties go toward +infinity).
 *  - Products that could leave the safe-integer range are computed with BigInt.
 */

/** Integer centavos. `₱17,329.00` is `1732900`. */
export type Minor = number;
/** Basis points. 100% = 10_000. */
export type Bp = number;

export const BP_TOTAL = 10_000;
/** ₱10,000,000.00 in centavos. */
export const MAX_MINOR: Minor = 1_000_000_000;
export const CENTAVOS_PER_PESO = 100;

/** Throws unless `n` is a safe integer. Returns it for chaining. */
export function assertSafeInt(n: number, what = "value"): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n)) {
    throw new RangeError(`${what} must be a safe integer, got ${String(n)}`);
  }
  return n;
}

/** Amount in centavos: safe integer (may be negative, e.g. a bucket that is overspent). */
export function assertMinor(n: number, what = "amount"): Minor {
  return assertSafeInt(n, what);
}

/** Basis points: safe integer between 0 and 10_000. */
export function assertBp(n: number, what = "bp"): Bp {
  assertSafeInt(n, what);
  if (n < 0 || n > BP_TOTAL) throw new RangeError(`${what} must be 0..${BP_TOTAL}, got ${n}`);
  return n;
}

/** floor(a / b) for integers, b > 0, exact for any safe integers (also negative a). */
export function floorDiv(a: number, b: number): number {
  assertSafeInt(a, "dividend");
  assertSafeInt(b, "divisor");
  if (b <= 0) throw new RangeError("divisor must be > 0");
  const r = ((a % b) + b) % b;
  return (a - r) / b;
}

/** ceil(a / b) for integers, b > 0. */
export function ceilDiv(a: number, b: number): number {
  return -floorDiv(-a, b);
}

/** Median of integers, even count -> average rounded half up. */
export function medianInt(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("median of empty list");
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  if (s.length % 2 === 1) return s[mid] as number;
  return floorDiv((s[mid - 1] as number) + (s[mid] as number) + 1, 2);
}

function floorDivBig(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

/**
 * round_half_up(a * num / den), exact. `den` must be > 0.
 * Equivalent to floor((2 * a * num + den) / (2 * den)); uses BigInt internally so
 * ₱10,000,000.00 × 10_000 bp (1e13) and beyond can never lose precision.
 */
export function mulDivRound(a: number, num: number, den: number): number {
  assertSafeInt(a, "a");
  assertSafeInt(num, "num");
  assertSafeInt(den, "den");
  if (den <= 0) throw new RangeError("den must be > 0");
  const A = BigInt(a);
  const N = BigInt(num);
  const D = BigInt(den);
  const r = floorDivBig(2n * A * N + D, 2n * D);
  const out = Number(r);
  if (!Number.isSafeInteger(out)) throw new RangeError("result is not a safe integer");
  return out;
}

/** round_half_up(amount * bp / 10_000). */
export function bpShare(amount: Minor, bp: Bp): Minor {
  return mulDivRound(amount, bp, BP_TOTAL);
}

/** Sum of integers, asserting the total stays safe. */
export function sum(values: readonly number[]): number {
  let t = 0;
  for (const v of values) t += assertSafeInt(v);
  return assertSafeInt(t, "sum");
}

/** Whole percent (0..100) to basis points. */
export function percentToBp(pct: number): Bp {
  assertSafeInt(pct, "percent");
  return pct * 100;
}

/** Basis points to whole percent; throws if not a whole percent. */
export function bpToPercent(bp: Bp): number {
  assertSafeInt(bp, "bp");
  if (bp % 100 !== 0) throw new RangeError(`bp ${bp} is not a whole percent`);
  return bp / 100;
}

/** ISO date `YYYY-MM-DD` (calendar date, no time zone). */
export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 for an ISO date (UTC, no DST effects). */
export function dayNumber(d: IsoDate): number {
  const m = ISO_RE.exec(d);
  if (!m) throw new RangeError(`not an ISO date: ${d}`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round(t / 86_400_000);
}

export function dateFromDayNumber(n: number): IsoDate {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return dateFromDayNumber(dayNumber(d) + n);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from);
}
