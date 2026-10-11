import { describe, expect, it } from "vitest";
import { formatPercent } from "./format";
import { goalProgressBp, milestonesCrossed, paydaysToGo } from "./goals";

describe("G10: Emergency at 554528, then G2 confirmed", () => {
  const target = 5000000;
  const before = 554528;
  const after = before + 736000;
  it("Emergency becomes 1290528 = 25.8% of 5000000", () => {
    expect(after).toBe(1290528);
    expect(goalProgressBp(after, target)).toBe(2581);
    expect(formatPercent(goalProgressBp(after, target), 1)).toBe("25.8%");
  });
  it("Passed 25% today", () => {
    expect(milestonesCrossed(before, after, target)).toEqual([25]);
  });
  it("About 7 more paydays like Oct 7 (ceil(3709472 / 554528))", () => {
    expect(paydaysToGo(after, target, 554528)).toBe(7);
  });
});

describe("goalProgressBp", () => {
  it("caps at 100% and floors at 0", () => {
    expect(goalProgressBp(6000000, 5000000)).toBe(10000);
    expect(goalProgressBp(-5, 5000000)).toBe(0);
    expect(goalProgressBp(0, 5000000)).toBe(0);
    expect(goalProgressBp(5000000, 5000000)).toBe(10000);
  });
  it("floors (does not claim a milestone early)", () => {
    expect(goalProgressBp(2499999, 10000000)).toBe(2499);
  });
  it("target must be > 0", () => {
    expect(() => goalProgressBp(1, 0)).toThrow();
  });
});

describe("milestonesCrossed", () => {
  const t = 10000;
  it("at-or-above counts; exactly on the line crosses", () => {
    expect(milestonesCrossed(2499, 2500, t)).toEqual([25]);
  });
  it("already above does not cross again", () => {
    expect(milestonesCrossed(2500, 2600, t)).toEqual([]);
  });
  it("one confirm can cross several", () => {
    expect(milestonesCrossed(0, 7600, t)).toEqual([25, 50, 75]);
  });
  it("100 crosses when reaching the target, overshoot is capped", () => {
    expect(milestonesCrossed(9000, 12000, t)).toEqual([100]);
    expect(milestonesCrossed(12000, 15000, t)).toEqual([]);
  });
  it("withdrawal then refill re-crosses (below -> at-or-above)", () => {
    expect(milestonesCrossed(2000, 2600, t)).toEqual([25]);
  });
  it("moving down crosses nothing", () => {
    expect(milestonesCrossed(5000, 1000, t)).toEqual([]);
  });
});

describe("paydaysToGo", () => {
  it("hidden (null) without a Work payday or with a zero share", () => {
    expect(paydaysToGo(0, 100, null)).toBeNull();
    expect(paydaysToGo(0, 100, undefined)).toBeNull();
    expect(paydaysToGo(0, 100, 0)).toBeNull();
  });
  it("0 when the goal is met; exact division does not round up", () => {
    expect(paydaysToGo(100, 100, 10)).toBe(0);
    expect(paydaysToGo(0, 100, 10)).toBe(10);
    expect(paydaysToGo(0, 101, 10)).toBe(11);
  });
});
