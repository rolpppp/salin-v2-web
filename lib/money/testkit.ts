// Shared fixtures for tests (the owner's sheet / prototype data). Not part of the public API.
import type { PercentLine, PlanSplitOptions } from "./split";

export const BUCKETS = ["tax", "living", "rent", "emergency", "invest", "sinking", "fun", "buffer", "dost"] as const;

const lines = (o: Record<string, number>): PercentLine[] => Object.entries(o).map(([bucketId, pct]) => ({ bucketId, bp: pct * 100 }));

export const PLAN_A = lines({ tax: 6, living: 7, rent: 2, emergency: 30, invest: 30, sinking: 10, fun: 10, buffer: 5 });
export const PLAN_B = lines({ tax: 6, living: 7, rent: 2, emergency: 10, invest: 50, sinking: 10, fun: 10, buffer: 5 });

export const RENT_REDIRECT = { rentBucketId: "rent", startDate: "2027-01-01" } as const;

export const planOpts = (onDate: string, rentRedirect: PlanSplitOptions["rentRedirect"] = RENT_REDIRECT): PlanSplitOptions => ({
  onDate,
  buckets: BUCKETS,
  emergencyBucketId: "emergency",
  rentRedirect,
});

export const toMap = (ls: readonly { bucketId: string; amount: number }[]): Record<string, number> => Object.fromEntries(ls.map((l) => [l.bucketId, l.amount]));

/** Deterministic PRNG (mulberry32) so property tests are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
