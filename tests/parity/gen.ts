// Seeded random case generators for the parity test. Pure; everything flows from one `rng(seed)`.
export type Rand = () => number;

export const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
export const chance = (r: Rand, p: number): boolean => r() < p;
export const pick = <T>(r: Rand, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)] as T;

/** Fisher-Yates on a copy. */
export function shuffle<T>(r: Rand, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** `n` basis-point values (>= 0) that sum to exactly 10000, in one of several shapes (random, whole percents, ties, sparse). */
export function randomBps(r: Rand, n: number): number[] {
  const style = int(r, 0, 3);
  if (style === 2) {
    const base = Math.floor(10000 / n);
    const out = Array.from({ length: n }, () => base);
    out[int(r, 0, n - 1)] = (out[0] as number) + (10000 - base * n);
    return out;
  }
  const unit = style === 1 ? 100 : 1;
  const total = 10000 / unit;
  let cuts = Array.from({ length: n - 1 }, () => int(r, 0, total));
  if (style === 3) cuts = cuts.map((c, i) => (i % 2 === 0 ? 0 : c));
  cuts.sort((a, b) => a - b);
  const out: number[] = [];
  let prev = 0;
  for (const c of [...cuts, total]) {
    out.push((c - prev) * unit);
    prev = c;
  }
  return out;
}

/** Mostly small amounts (where rounding and the P-1 rule bite), some realistic, some large. */
export function randomAmount(r: Rand): number {
  const k = int(r, 0, 9);
  if (k < 3) return int(r, 0, 20);
  if (k < 5) return int(r, 21, 2000);
  if (k < 6) return pick(r, [333, 1000001, 1732900, 2300000, 350000, 150000, 1, 2, 3]);
  return int(r, 2001, 1_000_000_000);
}

export const DATES = ["2026-12-24", "2026-12-31", "2027-01-01", "2027-01-02", "2026-10-07"] as const;
