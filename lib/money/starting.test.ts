import { describe, expect, it } from "vitest";
import { accountGap, leftToSort, splitAmongKept, suggestStart, type StartKeptBucket } from "./starting";
import { rng } from "./testkit";

const k = (id: string, percentBp: number, displayOrder: number, extra: Partial<StartKeptBucket> = {}): StartKeptBucket => ({ id, percentBp, planless: false, displayOrder, ...extra });
const total = (ls: { amountMinor: number }[]) => ls.reduce((t, l) => t + l.amountMinor, 0);

describe("splitAmongKept", () => {
  it("renormalises the plan percentages among the buckets kept there", () => {
    // Emergency 30%, Buffer 5%, Goals 5% -> 75 / 12.5 / 12.5 of ₱20,000
    const r = splitAmongKept(2_000_000, [k("em", 3000, 1, { isEmergency: true }), k("buf", 500, 2), k("goals", 500, 3)]);
    expect(r).toEqual([
      { bucketId: "em", amountMinor: 1_500_000 },
      { bucketId: "buf", amountMinor: 250_000 },
      { bucketId: "goals", amountMinor: 250_000 },
    ]);
  });
  it("planless buckets and 0% lines get 0", () => {
    const r = splitAmongKept(100_000, [k("a", 0, 1), k("sch", 5000, 2, { planless: true }), k("b", 2000, 3)]);
    expect(r.map((x) => x.amountMinor)).toEqual([0, 0, 100_000]);
  });
  it("all at 0% or planless: everything goes to the first by display order", () => {
    const r = splitAmongKept(55_555, [k("late", 0, 9), k("first", 0, 2), k("sch", 4000, 5, { planless: true })]);
    expect(r).toEqual([
      { bucketId: "first", amountMinor: 55_555 },
      { bucketId: "sch", amountMinor: 0 },
      { bucketId: "late", amountMinor: 0 },
    ]);
  });
  it("rounds half up and puts the remainder on the Emergency fund, else the largest share (first on a tie)", () => {
    // 100 centavos over three equal shares: 33 + 33 + 33 + remainder 1
    expect(splitAmongKept(100, [k("a", 1000, 1), k("b", 1000, 2), k("c", 1000, 3)]).map((x) => x.amountMinor)).toEqual([34, 33, 33]);
    expect(splitAmongKept(100, [k("a", 1000, 1), k("b", 1000, 2), k("em", 1000, 3, { isEmergency: true })]).map((x) => x.amountMinor)).toEqual([33, 33, 34]);
    // 1 centavo over two equal shares: both round up to 1, remainder -1 is taken back from the first
    expect(splitAmongKept(1, [k("a", 5000, 1), k("b", 5000, 2)]).map((x) => x.amountMinor)).toEqual([0, 1]);
  });
  it("an Emergency fund at 0% does not take the remainder", () => {
    expect(splitAmongKept(100, [k("em", 0, 1, { isEmergency: true }), k("a", 1000, 2), k("b", 1000, 3), k("c", 1000, 4)]).map((x) => x.amountMinor)).toEqual([0, 34, 33, 33]);
  });
  it("one bucket gets everything; nothing kept returns no lines", () => {
    expect(splitAmongKept(777, [k("only", 0, 1)])).toEqual([{ bucketId: "only", amountMinor: 777 }]);
    expect(splitAmongKept(777, [])).toEqual([]);
  });
  it("the parts always sum to the amount (random cases), and never go negative", () => {
    const r = rng(38);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(r() * 6);
      const kept = Array.from({ length: n }, (_, j) => k(`b${j}`, Math.floor(r() * 4) * 250 * Math.floor(r() * 5), j + 1, { planless: r() < 0.15, isEmergency: j === 0 && r() < 0.5 }));
      const amount = 1 + Math.floor(r() * 50_000_000);
      const parts = splitAmongKept(amount, kept);
      expect(total(parts)).toBe(amount);
      for (const p of parts) expect(p.amountMinor).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("suggestStart (P-14)", () => {
  // The owner's accounts: GCash keeps Spending + Fun, MariBank keeps Emergency/Buffer/Goals, GoTrade keeps Investment, Cash keeps none.
  const accounts = [
    { id: "gc", unbucketedMinor: 1_500_000, keptBuckets: [k("spending", 4000, 1), k("fun", 1000, 2)] },
    { id: "bank", unbucketedMinor: 2_000_000, keptBuckets: [k("em", 3000, 3, { isEmergency: true }), k("buf", 500, 4), k("goals", 500, 5)] },
    { id: "gt", unbucketedMinor: 500_000, keptBuckets: [k("invest", 1000, 6)] },
    { id: "cash", unbucketedMinor: 300_000, keptBuckets: [] },
  ];
  const lines = suggestStart({ accounts, spendingBucketId: "spending" });
  const sumFor = (id: string) => total(lines.filter((l) => l.accountId === id));
  it("the lines for each account add up to its unbucketed money", () => {
    for (const a of accounts) expect(sumFor(a.id)).toBe(a.unbucketedMinor);
  });
  it("splits by plan inside an account, and sends an account with no bucket to Spending", () => {
    expect(lines.filter((l) => l.accountId === "gc").map((l) => [l.bucketId, l.amountMinor])).toEqual([["spending", 1_200_000], ["fun", 300_000]]);
    expect(lines.filter((l) => l.accountId === "cash")).toEqual([{ accountId: "cash", bucketId: "spending", amountMinor: 300_000 }]);
    expect(lines.filter((l) => l.accountId === "gt")).toEqual([{ accountId: "gt", bucketId: "invest", amountMinor: 500_000 }]);
  });
  it("ignores a gap that is zero or negative", () => {
    const r = suggestStart({ accounts: [{ id: "a", unbucketedMinor: -500, keptBuckets: [k("x", 100, 1)] }, { id: "b", unbucketedMinor: 0, keptBuckets: [] }], spendingBucketId: "x" });
    expect(r).toEqual([]);
  });
  it("an account with no bucket and no Spending bucket gets nothing", () => {
    expect(suggestStart({ accounts: [{ id: "cash", unbucketedMinor: 100, keptBuckets: [] }], spendingBucketId: null })).toEqual([]);
  });
});

describe("leftToSort and accountGap", () => {
  it("shows what is left, or the overshoot as a negative", () => {
    expect(leftToSort(1000, [400, 300])).toBe(300);
    expect(leftToSort(1000, [600, 600])).toBe(-200);
  });
  it("names the direction of the gap", () => {
    expect(accountGap(5000, 5000)).toEqual({ kind: "even", amountMinor: 0 });
    expect(accountGap(5000, 0)).toEqual({ kind: "unbucketed", amountMinor: 5000 });
    expect(accountGap(1000, 4000)).toEqual({ kind: "overcounted", amountMinor: 3000 });
  });
});
