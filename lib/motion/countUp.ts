/** Quartic ease-out, 0..1 -> 0..1 (the prototype's count-up curve). */
export const easeOutQuart = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);

/** The integer shown `t` (0..1) of the way from `from` to `to`. Integers only: money is centavos. */
export function countValue(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  return Math.round(from + (to - from) * easeOutQuart(t));
}
