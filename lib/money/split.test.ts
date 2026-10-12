import { describe, expect, it } from "vitest";
import { BP_TOTAL } from "./core";
import { BUCKETS, PLAN_A, PLAN_B, planOpts, rng, toMap } from "./testkit";
import { activePlan, confirmIncomes, resolveJob, splitByPlan, splitOne, splitOwn, splitWhole } from "./split";
import type { ConfirmContext, PercentLine } from "./split";

const own = (o: Record<string, number>): PercentLine[] => Object.entries(o).map(([bucketId, pct]) => ({ bucketId, bp: pct * 100 }));
const total = (ls: readonly { amount: number }[]): number => ls.reduce((t, l) => t + l.amount, 0);
const ownLines = (r: ReturnType<typeof splitOwn>) => {
  if (r.kind !== "split") throw new Error("expected split");
  return r.lines;
};

describe("splitByPlan: golden tests", () => {
  it("G1: 1732900, Plan A, Oct 7 2026", () => {
    const r = splitByPlan(1732900, PLAN_A, planOpts("2026-10-07"));
    expect(toMap(r)).toEqual({ tax: 103974, living: 121303, rent: 0, emergency: 554528, invest: 519870, sinking: 173290, fun: 173290, buffer: 86645, dost: 0 });
    expect(total(r)).toBe(1732900);
  });
  it("G2: 2300000, Plan A, Oct 8 2026", () => {
    const r = splitByPlan(2300000, PLAN_A, planOpts("2026-10-08"));
    expect(toMap(r)).toEqual({ tax: 138000, living: 161000, rent: 0, emergency: 736000, invest: 690000, sinking: 230000, fun: 230000, buffer: 115000, dost: 0 });
  });
  it("G3: 1000001 gets the +1 remainder in Emergency", () => {
    const r = splitByPlan(1000001, PLAN_A, planOpts("2026-12-31"));
    expect(toMap(r)).toMatchObject({ tax: 60000, living: 70000, emergency: 320001, invest: 300000, sinking: 100000, fun: 100000, buffer: 50000 });
    expect(total(r)).toBe(1000001);
  });
  it("G4: 333", () => {
    const r = splitByPlan(333, PLAN_A, planOpts("2026-06-01"));
    expect(toMap(r)).toMatchObject({ tax: 20, living: 23, emergency: 107, invest: 100, sinking: 33, fun: 33, buffer: 17 });
    expect(total(r)).toBe(333);
  });
});

describe("splitByPlan: rent redirect (D-17) and edge cases", () => {
  it("rent gets its own percentage on or after the start date", () => {
    const r = toMap(splitByPlan(1000000, PLAN_A, planOpts("2027-01-01")));
    expect(r.rent).toBe(20000);
    expect(r.emergency).toBe(300000);
  });
  it("the day before the start date still redirects", () => {
    const r = toMap(splitByPlan(1000000, PLAN_A, planOpts("2026-12-31")));
    expect(r.rent).toBe(0);
    expect(r.emergency).toBe(320000);
  });
  it("uses the income date, not any confirm date (late confirming does not change the split)", () => {
    const a = splitByPlan(500000, PLAN_A, planOpts("2026-12-30"));
    expect(toMap(a).rent).toBe(0);
  });
  it("no rent rule: rent keeps its share whatever the date", () => {
    expect(toMap(splitByPlan(1000000, PLAN_A, planOpts("2020-01-01", null))).rent).toBe(20000);
  });
  it("Plan B after redirect", () => {
    const r = toMap(splitByPlan(1000000, PLAN_B, planOpts("2026-10-01")));
    expect(r.emergency).toBe(120000);
    expect(r.invest).toBe(500000);
    expect(r.rent).toBe(0);
  });
  it("amount 1: everything rounds to 0, remainder 1 goes to Emergency", () => {
    const r = splitByPlan(1, PLAN_A, planOpts("2026-10-01"));
    expect(total(r)).toBe(1);
    expect(toMap(r).emergency).toBe(1);
  });
  it("amount 0 gives all-zero lines", () => {
    expect(total(splitByPlan(0, PLAN_A, planOpts("2026-10-01")))).toBe(0);
  });
  it("negative remainder never makes a line negative (PM decision 2026-10-11, pending owner confirmation)", () => {
    // 2 centavos: 35/35/25/5 -> 0.7, 0.7, 0.5 round up to 1 each, 0.1 -> 0; sum 3, remainder -1.
    // Emergency can only give 0, so the rest comes from the largest bp share (first on a tie).
    const plan: PercentLine[] = [
      { bucketId: "fun", bp: 3500 },
      { bucketId: "living", bp: 3500 },
      { bucketId: "invest", bp: 2500 },
      { bucketId: "emergency", bp: 500 },
    ];
    const r = toMap(splitByPlan(2, plan, planOpts("2026-10-01", null)));
    expect(r).toMatchObject({ living: 0, fun: 1, invest: 1, emergency: 0 });
  });
  it("small amounts 1, 2 and 3 with small Emergency shares: sums exact, no negative line", () => {
    const plans: PercentLine[][] = [
      [{ bucketId: "fun", bp: 5000 }, { bucketId: "living", bp: 4500 }, { bucketId: "emergency", bp: 500 }],
      [{ bucketId: "fun", bp: 3400 }, { bucketId: "living", bp: 3400 }, { bucketId: "invest", bp: 2800 }, { bucketId: "emergency", bp: 400 }],
      PLAN_A,
      PLAN_B,
    ];
    for (const amount of [1, 2, 3]) {
      for (const p of plans) {
        const out = splitByPlan(amount, p, planOpts("2026-10-01", null));
        expect(total(out)).toBe(amount);
        expect(out.every((l) => l.amount >= 0)).toBe(true);
      }
    }
  });
  it("Emergency absorbs part of a negative remainder, the rest comes from the largest share", () => {
    // 3 centavos, 3 x 16.5% + 50.5%... craft: shares 1,1,1 (0.5 each rounds up) + emergency 1 (0.5) => sum 4, remainder -1.
    const plan: PercentLine[] = [
      { bucketId: "fun", bp: 1667 },
      { bucketId: "living", bp: 1667 },
      { bucketId: "invest", bp: 1667 },
      { bucketId: "emergency", bp: 4999 },
    ];
    const out = splitByPlan(3, plan, planOpts("2026-10-01", null));
    expect(total(out)).toBe(3);
    expect(out.every((l) => l.amount >= 0)).toBe(true);
  });
  it("splitOwn: negative remainder never makes a line negative", () => {
    for (const amount of [1, 2, 3]) {
      const r = ownLines(splitOwn(amount, [{ bucketId: "a", bp: 5000 }, { bucketId: "b", bp: 4500 }, { bucketId: "c", bp: 500 }]));
      expect(total(r)).toBe(amount);
      expect(r.every((l) => l.amount >= 0)).toBe(true);
    }
    expect(toMap(ownLines(splitOwn(1, [{ bucketId: "a", bp: 5000 }, { bucketId: "b", bp: 5000 }])))).toEqual({ a: 0, b: 1 });
  });
  it("Emergency at 0% after redirect: remainder goes to the largest share", () => {
    const plan: PercentLine[] = [
      { bucketId: "living", bp: 3333 },
      { bucketId: "fun", bp: 3333 },
      { bucketId: "invest", bp: 3334 },
    ];
    const r = splitByPlan(100, plan, planOpts("2026-10-01"));
    // 33.33 -> 33, 33.33 -> 33, 33.34 -> 33 ; remainder 1 -> invest (largest)
    expect(toMap(r)).toMatchObject({ living: 33, fun: 33, invest: 34, emergency: 0 });
  });
  it("tie for largest share breaks by bucket order (first wins)", () => {
    const plan: PercentLine[] = [
      { bucketId: "invest", bp: 3333 },
      { bucketId: "tax", bp: 3333 },
      { bucketId: "fun", bp: 3334 - 1 },
      { bucketId: "living", bp: 1 },
    ];
    // largest: invest/tax/fun at 3333: BUCKETS order is tax, living, rent, emergency, invest, ... so tax wins
    const r = toMap(splitByPlan(100, plan, planOpts("2026-10-01")));
    expect(r.tax).toBe(34);
    expect(r.invest).toBe(33);
    expect(r.fun).toBe(33);
  });
  it("planless buckets (Scholarship) get 0", () => {
    expect(toMap(splitByPlan(777, PLAN_A, planOpts("2026-10-01"))).dost).toBe(0);
  });
  it("plan that does not total 100% throws", () => {
    expect(() => splitByPlan(100, PLAN_A.slice(1), planOpts("2026-10-01"))).toThrow(/10000/);
  });
  it("unknown bucket / duplicate line throws", () => {
    expect(() => splitByPlan(100, [{ bucketId: "nope", bp: BP_TOTAL }], planOpts("2026-10-01"))).toThrow(/unknown/);
    expect(() => splitByPlan(100, [...PLAN_A, { bucketId: "tax", bp: 0 }], planOpts("2026-10-01"))).toThrow(/duplicate/);
  });
  it("rejects non-integer and unsafe amounts", () => {
    expect(() => splitByPlan(10.5, PLAN_A, planOpts("2026-10-01"))).toThrow();
    expect(() => splitByPlan(Number.MAX_SAFE_INTEGER + 2, PLAN_A, planOpts("2026-10-01"))).toThrow();
    expect(() => splitByPlan(NaN, PLAN_A, planOpts("2026-10-01"))).toThrow();
  });
  it("max amount (₱10,000,000.00) is exact", () => {
    const r = splitByPlan(1_000_000_000, PLAN_A, planOpts("2026-10-01"));
    expect(total(r)).toBe(1_000_000_000);
    expect(toMap(r).emergency).toBe(320_000_000);
  });
});

describe("splitOwn", () => {
  it("G5: ₱3,500.00, Tax 10 / Sinking 40 / Fun 50", () => {
    const r = ownLines(splitOwn(350000, own({ tax: 10, sinking: 40, fun: 50 })));
    expect(toMap(r)).toEqual({ tax: 35000, sinking: 140000, fun: 175000 });
  });
  it("G6: Tax 10 / Sinking 40 / Fun 40 is No job, never rescaled", () => {
    const r = splitOwn(350000, own({ tax: 10, sinking: 40, fun: 40 }));
    expect(r).toEqual({ kind: "no_job", reason: "own_split_incomplete", totalBp: 9000 });
  });
  it("over 100% is also no job", () => {
    expect(splitOwn(100, own({ tax: 60, fun: 60 })).kind).toBe("no_job");
  });
  it("buckets at 0% get nothing and are left out", () => {
    const r = ownLines(splitOwn(1000, [...own({ tax: 100 }), { bucketId: "fun", bp: 0 }]));
    expect(r).toEqual([{ bucketId: "tax", amount: 1000 }]);
  });
  it("remainder goes to the largest percentage; ties go to the first", () => {
    // 3 x 33.33.. is not valid bp; use 3333/3333/3334 -> largest is the third
    const r = toMap(ownLines(splitOwn(100, [{ bucketId: "a", bp: 3333 }, { bucketId: "b", bp: 3333 }, { bucketId: "c", bp: 3334 }])));
    expect(r).toEqual({ a: 33, b: 33, c: 34 });
    const t = toMap(ownLines(splitOwn(1, [{ bucketId: "a", bp: 5000 }, { bucketId: "b", bp: 5000 }])));
    expect(t).toEqual({ a: 0, b: 1 }); // each 0.5 rounds up to 1 -> remainder -1 to FIRST (a): 1 + -1 = 0
  });
  it("amount 1 still sums", () => {
    const r = ownLines(splitOwn(1, own({ tax: 10, sinking: 40, fun: 50 })));
    expect(total(r)).toBe(1);
  });
});

describe("splitWhole / splitOne", () => {
  it("whole is 100% to one bucket", () => {
    expect(splitWhole(150000, "living")).toEqual([{ bucketId: "living", amount: 150000 }]);
  });
  it("one defaults to Emergency and refuses Rent", () => {
    const ctx = { emergencyBucketId: "emergency", rentBucketId: "rent" };
    expect(splitOne(500, null, ctx)).toEqual([{ bucketId: "emergency", amount: 500 }]);
    expect(splitOne(500, "fun", ctx)).toEqual([{ bucketId: "fun", amount: 500 }]);
    expect(() => splitOne(500, "rent", ctx)).toThrow(/Rent/);
  });
});

describe("resolveJob (BR §2.1)", () => {
  const sources = {
    work: { rule: "plan" as const },
    stipend: { rule: "whole" as const, wholeBucketId: "dost" },
    side: { rule: "own" as const, splitLines: own({ tax: 10, sinking: 40, fun: 50 }) },
    broken: { rule: "own" as const, splitLines: own({ tax: 10, sinking: 40, fun: 40 }) },
    others: { rule: "ask" as const },
  };
  it("user's pick wins", () => {
    expect(resolveJob({ job: "plan" }, sources.others)).toEqual({ kind: "job", job: "plan" });
    expect(resolveJob({ job: "one", oneBucketId: "fun" }, sources.others)).toEqual({ kind: "job", job: "one", bucketId: "fun" });
  });
  it("otherwise the source rule", () => {
    expect(resolveJob({}, sources.work)).toEqual({ kind: "job", job: "plan" });
    expect(resolveJob({ job: null }, sources.stipend)).toEqual({ kind: "job", job: "whole", bucketId: "dost" });
    expect(resolveJob({}, sources.side).kind).toBe("job");
  });
  it("ask has no job", () => {
    expect(resolveJob({}, sources.others)).toEqual({ kind: "no_job", reason: "ask" });
  });
  it("G6: broken own split has no job, even if the user picked own", () => {
    expect(resolveJob({}, sources.broken)).toEqual({ kind: "no_job", reason: "own_split_incomplete", totalBp: 9000 });
    expect(resolveJob({ job: "own" }, sources.broken).kind).toBe("no_job");
  });
  it("whole without a bucket has no job", () => {
    expect(resolveJob({}, { rule: "whole" })).toEqual({ kind: "no_job", reason: "whole_bucket_missing" });
  });
});

describe("activePlan (D-14)", () => {
  it("A until the sum of Emergency allocations reaches the target, then B", () => {
    expect(activePlan(0, 5000000)).toBe("A");
    expect(activePlan(4999999, 5000000)).toBe("A");
    expect(activePlan(5000000, 5000000)).toBe("B");
  });
  it("switch off keeps Plan A", () => {
    expect(activePlan(9e9, 5000000, undefined, false)).toBe("A");
  });
});

describe("confirmIncomes", () => {
  const ctx = (emergencyAllocatedSoFar: number, switchTarget: number): ConfirmContext => ({
    plans: { A: PLAN_A, B: PLAN_B },
    buckets: BUCKETS,
    emergencyBucketId: "emergency",
    rentRedirect: { rentBucketId: "rent", startDate: "2027-01-01" },
    emergencyAllocatedSoFar,
    switchTarget,
  });
  const work = { rule: "plan" as const };
  it("confirms in date order regardless of input order", () => {
    const r = confirmIncomes(
      [
        { id: "late", date: "2026-10-09", amount: 1000, choice: {}, source: work },
        { id: "early", date: "2026-10-01", amount: 1000, choice: {}, source: work },
      ],
      ctx(0, 5000000),
    );
    expect(r.map((x) => x.id)).toEqual(["early", "late"]);
  });
  it("the first income can switch the plan for the next", () => {
    // target 1,000,000: first income gives Emergency 32% of 2,000,000 = 640,000 (A). Second: 640k < 1M -> A. Third: 1.28M >= 1M -> B.
    const r = confirmIncomes(
      [
        { id: "i1", date: "2026-10-01", amount: 2000000, choice: {}, source: work },
        { id: "i2", date: "2026-10-02", amount: 2000000, choice: {}, source: work },
        { id: "i3", date: "2026-10-03", amount: 2000000, choice: {}, source: work },
      ],
      ctx(0, 1000000),
    );
    const keys = r.map((x) => (x.confirmed && x.planKey) || null);
    expect(keys).toEqual(["A", "A", "B"]);
  });
  it("plan is evaluated before the income being confirmed is added", () => {
    const r = confirmIncomes([{ id: "i1", date: "2026-10-01", amount: 99999999, choice: {}, source: work }], ctx(0, 1));
    expect(r[0]).toMatchObject({ confirmed: true, planKey: "A" });
  });
  it("no-job incomes are not confirmed and do not move the running total", () => {
    const r = confirmIncomes(
      [
        { id: "ask", date: "2026-10-01", amount: 2300000, choice: {}, source: { rule: "ask" } },
        { id: "w", date: "2026-10-02", amount: 1000, choice: {}, source: work },
      ],
      ctx(0, 5000000),
    );
    expect(r[0]).toEqual({ id: "ask", confirmed: false, reason: "ask" });
    expect(r[1]).toMatchObject({ confirmed: true, planKey: "A" });
  });
  it("whole and one jobs add to the Emergency total when they land there", () => {
    const r = confirmIncomes(
      [
        { id: "gift", date: "2026-10-01", amount: 1000000, choice: { job: "one" }, source: { rule: "ask" } },
        { id: "w", date: "2026-10-02", amount: 1000, choice: {}, source: work },
      ],
      ctx(0, 1000000),
    );
    expect(r[1]).toMatchObject({ planKey: "B" });
  });
});

describe("property: parts always sum to the amount", () => {
  const r = rng(20261011);
  const randPlan = (ids: readonly string[]): PercentLine[] => {
    // random bp split of 10000 over a random subset
    const n = 1 + Math.floor(r() * ids.length);
    const chosen = [...ids].sort(() => r() - 0.5).slice(0, n);
    const cuts = Array.from({ length: n - 1 }, () => Math.floor(r() * (BP_TOTAL + 1))).sort((a, b) => a - b);
    const bps = [...cuts, BP_TOTAL].map((c, i) => c - (i === 0 ? 0 : (cuts[i - 1] as number)));
    return chosen.map((bucketId, i) => ({ bucketId, bp: bps[i] as number }));
  };
  it("splitByPlan, 3000 random amounts and plans", () => {
    for (let i = 0; i < 3000; i++) {
      const amount = 1 + Math.floor(r() * 1_000_000_000);
      const plan = randPlan(BUCKETS);
      const date = r() < 0.5 ? "2026-10-01" : "2027-02-01";
      const out = splitByPlan(amount, plan, planOpts(date));
      expect(total(out)).toBe(amount);
      expect(out.every((l) => l.amount >= 0)).toBe(true);
    }
  });
  it("splitByPlan with the real plans at extreme and small amounts", () => {
    for (const amount of [1, 2, 3, 7, 19, 99, 100, 101, 333, 999_999_999, 1_000_000_000]) {
      for (const p of [PLAN_A, PLAN_B]) {
        const out = splitByPlan(amount, p, planOpts("2026-10-01"));
        expect(total(out)).toBe(amount);
        expect(out.every((l) => l.amount >= 0)).toBe(true);
      }
    }
  });
  it("splitOwn, 3000 random amounts and splits", () => {
    for (let i = 0; i < 3000; i++) {
      const amount = 1 + Math.floor(r() * 1_000_000_000);
      const res = splitOwn(amount, randPlan(BUCKETS));
      expect(res.kind).toBe("split");
      expect(total(ownLines(res))).toBe(amount);
      expect(ownLines(res).every((l) => l.amount >= 0)).toBe(true);
    }
  });
});

describe("plans v2 (P-9): any plan keys, manual or automatic", () => {
  const CUSTOM: PercentLine[] = [
    { bucketId: "living", bp: 4000 },
    { bucketId: "emergency", bp: 6000 },
  ];
  const THIRD: PercentLine[] = [{ bucketId: "living", bp: 10_000 }];
  const base = (over: Partial<ConfirmContext> = {}): ConfirmContext => ({
    plans: { A: PLAN_A, B: PLAN_B, p_1a2b3c4d: CUSTOM, p_5e6f7a8b: THIRD },
    buckets: BUCKETS,
    emergencyBucketId: "emergency",
    rentRedirect: null,
    emergencyAllocatedSoFar: 0,
    switchTarget: 1_000_000,
    ...over,
  });
  const work = { rule: "plan" as const };
  const one = (ctx: ConfirmContext) => confirmIncomes([{ id: "i", date: "2026-10-01", amount: 100_000, choice: {}, source: work }], ctx)[0];

  it("manual mode always uses the chosen plan, whatever Emergency holds", () => {
    const r = one(base({ activePlan: { mode: "manual", planKey: "p_1a2b3c4d" }, emergencyAllocatedSoFar: 9e9 }));
    expect(r).toMatchObject({ confirmed: true, planKey: "p_1a2b3c4d" });
    expect(r && r.confirmed && toMap(r.lines)).toMatchObject({ living: 40_000, emergency: 60_000 });
  });
  it("auto uses the configured from and to plans, not just A and B", () => {
    const setting = { mode: "auto", from: "p_1a2b3c4d", to: "p_5e6f7a8b" } as const;
    expect(one(base({ activePlan: setting, emergencyAllocatedSoFar: 999_999 }))).toMatchObject({ planKey: "p_1a2b3c4d" });
    const r = one(base({ activePlan: setting, emergencyAllocatedSoFar: 1_000_000 }));
    expect(r).toMatchObject({ planKey: "p_5e6f7a8b" });
    expect(r && r.confirmed && toMap(r.lines)).toMatchObject({ living: 100_000, emergency: 0 });
  });
  it("the first income can switch to a custom plan for the next", () => {
    const r = confirmIncomes(
      [
        { id: "i1", date: "2026-10-01", amount: 2_000_000, choice: {}, source: work },
        { id: "i2", date: "2026-10-02", amount: 1000, choice: {}, source: work },
      ],
      base({ plans: { A: PLAN_A, B: PLAN_B, p_x: CUSTOM }, activePlan: { mode: "auto", from: "A", to: "p_x" }, switchTarget: 500_000 }),
    );
    expect(r.map((x) => (x.confirmed && x.planKey) || null)).toEqual(["A", "p_x"]);
  });
  it("no switch rule (switchOn false) stays on the from plan", () => {
    expect(one(base({ activePlan: { mode: "auto", from: "p_1a2b3c4d", to: "A" }, emergencyAllocatedSoFar: 9e9, switchOn: false }))).toMatchObject({ planKey: "p_1a2b3c4d" });
  });
  it("activePlan() picks per setting", () => {
    expect(activePlan(0, 100, { mode: "manual", planKey: "z" })).toBe("z");
    expect(activePlan(100, 100, { mode: "manual", planKey: "z" })).toBe("z");
    expect(activePlan(99, 100, { mode: "auto", from: "x", to: "y" })).toBe("x");
    expect(activePlan(100, 100, { mode: "auto", from: "x", to: "y" })).toBe("y");
    expect(activePlan(100, 100, { mode: "auto", from: "x", to: "y" }, false)).toBe("x");
  });
  it("a plan that is not in the context throws instead of guessing", () => {
    expect(() => one(base({ activePlan: { mode: "manual", planKey: "p_gone" } }))).toThrow(/plan p_gone not found/);
    expect(() => one(base({ activePlan: { mode: "manual", planKey: "toString" } }))).toThrow(/not found/);
  });
});
