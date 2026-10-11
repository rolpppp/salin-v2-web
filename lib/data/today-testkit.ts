/** Fixtures shared by the Today tests: the prototype's starting state (BR §10 G9) as a `TodayInput`. */
import { BUCKET, accounts, buckets, moneyInData, sources } from "./money-in-testkit";
import type { BucketFlow, TodayAllocation, TodayBucket, TodayInput } from "./today-model";

export { BUCKET };

export type Hue = keyof typeof BUCKET;

/** Noon in Manila on 2026-10-DD (UTC+8). */
export const ms = (day: number) => Date.UTC(2026, 9, day, 4, 0, 0);
export const TODAY = 11; // Sunday, Oct 11, 2026 (the prototype's "today"); the week is Oct 5 to 11

export const todayBuckets: TodayBucket[] = buckets.map((b) => ({ ...b, note: null }));

/** G1 (Oct 7, Plan A, ₱17,329.00) in centavos by hue. */
export const G1: Record<Hue, number> = { tax: 103_974, living: 121_303, rent: 0, emergency: 554_528, invest: 519_870, sinking: 173_290, fun: 173_290, buffer: 86_645, dost: 0 };
export const G2: Record<Hue, number> = { tax: 138_000, living: 161_000, rent: 0, emergency: 736_000, invest: 690_000, sinking: 230_000, fun: 230_000, buffer: 115_000, dost: 0 };

export function flowsOf(allocated: Partial<Record<Hue, number>>, spent: Partial<Record<Hue, number>> = {}, covers: { from: Hue; to: Hue; amount: number }[] = []): Record<string, BucketFlow> {
  const out: Record<string, BucketFlow> = {};
  for (const h of Object.keys(BUCKET) as Hue[]) {
    const coversIn = covers.filter((c) => c.to === h).reduce((t, c) => t + c.amount, 0);
    const coversOut = covers.filter((c) => c.from === h).reduce((t, c) => t + c.amount, 0);
    const a = allocated[h] ?? 0;
    const s = spent[h] ?? 0;
    out[BUCKET[h]] = { allocated: a, spent: s, coversIn, coversOut, left: a - s + coversIn - coversOut };
  }
  return out;
}

export function allocsOf(entryId: string, sourceId: string, by: Record<Hue, number>, occurredDay: number, confirmedDay: number): TodayAllocation[] {
  return (Object.keys(by) as Hue[]).filter((h) => by[h] > 0).map((h) => ({ entryId, bucketId: BUCKET[h], amountMinor: by[h], confirmedAt: ms(confirmedDay), occurredAt: ms(occurredDay), sourceId }));
}

export const mi = moneyInData();

/** The prototype's starting state: Oct 7 payday split by Plan A, Living ₱1,300 and Fun ₱1,300.50 spent. */
export function g9(overrides: Partial<TodayInput> = {}): TodayInput {
  return {
    nowMs: ms(TODAY),
    timeZone: "Asia/Manila",
    todayIso: "2026-10-11",
    profile: { nextPaydayDate: "2026-10-21", planMode: "plan", onboardedAt: null, reviewDay: 0, weekStartsOn: 1 },
    week: { startIso: "2026-10-05", endIso: "2026-10-12" },
    buckets: todayBuckets,
    accountNames: Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    flows: flowsOf(G1, { living: 130_000, fun: 130_050 }),
    activePlan: "A",
    plan: mi.plan,
    sources,
    incomes: [],
    transferPlan: [],
    allocations: allocsOf("g1", "work", G1, 7, 7),
    spendingThisMonth: [
      { bucketId: BUCKET.living, dateIso: "2026-10-08", amountMinor: 130_000, label: "Groceries" },
      { bucketId: BUCKET.fun, dateIso: "2026-10-09", amountMinor: 130_050, label: "Movies" },
    ],
    coversThisMonth: [],
    goals: [{ id: "em", name: "Emergency fund", targetMinor: 5_000_000, currency: "PHP", linkedBucketId: BUCKET.emergency, linkedShareBp: 10_000, isPlanSwitch: true }],
    weekClosed: false,
    anyWeekClosed: false,
    spendingLoggedAfterOnboarding: false,
    syncOff: false,
    ...overrides,
  };
}

