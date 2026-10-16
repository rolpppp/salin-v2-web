import { describe, expect, it } from "vitest";
import { accountShouldHold, bucketLeft, bucketNeeds, coverFromBuffer, isOverspent, perDay, safeToSpend, spendingImpact } from "./buckets";
import { formatPeso } from "./format";
import { PLAN_A, planOpts, toMap } from "./testkit";
import { splitByPlan } from "./split";

describe("G9 (unit level): starting state of the prototype", () => {
  const oct7 = toMap(splitByPlan(1732900, PLAN_A, planOpts("2026-10-07")));
  const living = bucketLeft({ allocated: oct7.living as number, spent: 61250 + 18000 + 35750 + 15000, coversIn: 0, coversOut: 0 });
  const fun = bucketLeft({ allocated: oct7.fun as number, spent: 52050 + 78000, coversIn: 0, coversOut: 0 });
  it("Living left -8697 shown as Needs ₱86.97", () => {
    expect(living).toBe(-8697);
    expect(isOverspent(living)).toBe(true);
    expect(bucketNeeds(living)).toBe(8697);
    expect(formatPeso(bucketNeeds(living))).toBe("₱86.97");
  });
  it("Fun left 43240", () => expect(fun).toBe(43240));
  it("safe to spend 34543 (sum as is), per day 3454 over 10 days", () => {
    const safe = safeToSpend([living, fun]);
    expect(safe).toBe(34543);
    expect(perDay(safe, 10)).toBe(3454);
  });
});

describe("bucketLeft", () => {
  it("allocations - spending + covers in - covers out", () => {
    expect(bucketLeft({ allocated: 1000, spent: 300, coversIn: 50, coversOut: 20 })).toBe(730);
  });
  it("can be negative and is not clamped", () => {
    expect(bucketLeft({ allocated: 0, spent: 5, coversIn: 0, coversOut: 0 })).toBe(-5);
  });
  it("needs is 0 when not overspent", () => {
    expect(bucketNeeds(0)).toBe(0);
    expect(bucketNeeds(10)).toBe(0);
    expect(isOverspent(0)).toBe(false);
  });
});

describe("coverFromBuffer (§4.3, D-19)", () => {
  it("covers all of the deficit when Buffer is enough", () => {
    expect(coverFromBuffer(-8697, 86645)).toEqual({ cover: 8697, stillNeeded: 0 });
  });
  it("Buffer short: cover what is there and name the rest", () => {
    expect(coverFromBuffer(-8697, 5000)).toEqual({ cover: 5000, stillNeeded: 3697 });
  });
  it("Buffer empty or negative: cover nothing, whole deficit still needed", () => {
    expect(coverFromBuffer(-100, 0)).toEqual({ cover: 0, stillNeeded: 100 });
    expect(coverFromBuffer(-100, -40)).toEqual({ cover: 0, stillNeeded: 100 });
  });
  it("exactly enough", () => {
    expect(coverFromBuffer(-500, 500)).toEqual({ cover: 500, stillNeeded: 0 });
  });
  it("not overspent: nothing to cover", () => {
    expect(coverFromBuffer(10, 1000)).toEqual({ cover: 0, stillNeeded: 0 });
  });
});

describe("safe to spend and per day (§4.4)", () => {
  it("negative safe is shown as is, per day floors at 0", () => {
    expect(safeToSpend([-8697, 4000])).toBe(-4697);
    expect(perDay(-4697, 10)).toBe(0);
  });
  it("floors, never rounds up", () => {
    expect(perDay(19, 10)).toBe(1);
    expect(perDay(9, 10)).toBe(0);
    expect(perDay(34543, 10)).toBe(3454);
  });
  it("payday today or past counts as 1 day", () => {
    expect(perDay(1000, 0)).toBe(1000);
    expect(perDay(1000, -3)).toBe(1000);
  });
  it("rejects non-integer days", () => {
    expect(() => perDay(1000, 2.5)).toThrow();
  });
});

describe("spendingImpact (§11.3)", () => {
  it("left after and per-day for Spend buckets only", () => {
    const s = spendingImpact({ bucketLeft: 950000, amount: 18000, safe: 34543, daysUntilPayday: 10, isSpendBucket: true });
    expect(s).toEqual({ leftAfter: 932000, perDayAfter: 1654 });
    expect(spendingImpact({ bucketLeft: 100, amount: 500, safe: 0, daysUntilPayday: 10, isSpendBucket: false })).toEqual({ leftAfter: -400, perDayAfter: null });
  });
});

describe("accountShouldHold (§5.1)", () => {
  it("allocations snapshotted here plus covers and spending of buckets kept here now", () => {
    expect(accountShouldHold({ allocationsHere: 1000000, bucketsKeptHere: [{ coversIn: 0, coversOut: 5000, spent: 2000 }, { coversIn: 300, coversOut: 0, spent: 0 }] })).toBe(993300);
  });
  it("no bucket kept here but money arrived earlier", () => {
    expect(accountShouldHold({ allocationsHere: 690000, bucketsKeptHere: [] })).toBe(690000);
  });
});

describe("starting money (ticket 38)", () => {
  it("counts in a bucket's left like an allocation", () => {
    expect(bucketLeft({ allocated: 1000, starts: 4000, spent: 300, coversIn: 0, coversOut: 0 })).toBe(4700);
    expect(bucketLeft({ allocated: 0, starts: 500, spent: 800, coversIn: 0, coversOut: 0 })).toBe(-300);
  });
  it("counts in the account it sits in, not the account its bucket is kept in", () => {
    // Spending kept in GCash holds 1,500 there; 300 of its starting money sits in Cash, which keeps no bucket.
    expect(accountShouldHold({ allocationsHere: 0, startsHere: 150000, bucketsKeptHere: [{ coversIn: 0, coversOut: 0, spent: 0 }] })).toBe(150000);
    expect(accountShouldHold({ allocationsHere: 0, startsHere: 30000, bucketsKeptHere: [] })).toBe(30000);
  });
  it("after a sort that fills the gap, should-hold equals the real balance", () => {
    const balance = 2_000_000;
    const unbucketed = balance - accountShouldHold({ allocationsHere: 0, bucketsKeptHere: [] });
    expect(accountShouldHold({ allocationsHere: 0, startsHere: unbucketed, bucketsKeptHere: [] })).toBe(balance);
  });
});
