import { describe, expect, it } from "vitest";
import { crossingsBetween, type GoalSnapshot } from "./goal-milestones";

const g = (id: string, savedMinor: number, over: Partial<GoalSnapshot> = {}): GoalSnapshot => ({ id, savedMinor, targetMinor: 5_000_000, kind: "emergency", ...over });

describe("crossingsBetween (goal_milestone_passed)", () => {
  it("reports a milestone once, when the action crosses it", () => {
    expect(crossingsBetween([g("a", 1_000_000)], [g("a", 1_300_000)])).toEqual([{ goalKind: "emergency", milestone: 25 }]);
  });
  it("reports nothing when no milestone was crossed, or when re-rendered with the same numbers", () => {
    expect(crossingsBetween([g("a", 1_300_000)], [g("a", 1_400_000)])).toEqual([]);
    expect(crossingsBetween([g("a", 1_300_000)], [g("a", 1_300_000)])).toEqual([]);
  });
  it("reports every milestone passed in one jump, in order, and 100 at the target", () => {
    expect(crossingsBetween([g("a", 0)], [g("a", 5_000_000)]).map((c) => c.milestone)).toEqual([25, 50, 75, 100]);
  });
  it("is exact at the boundary", () => {
    expect(crossingsBetween([g("a", 1_249_999)], [g("a", 1_250_000)]).map((c) => c.milestone)).toEqual([25]);
  });
  it("never fires for money going down", () => {
    expect(crossingsBetween([g("a", 3_000_000)], [g("a", 100_000)])).toEqual([]);
  });
  it("carries the goal kind and handles several goals", () => {
    const out = crossingsBetween([g("a", 0), g("b", 0, { kind: "custom" })], [g("a", 1_300_000), g("b", 2_600_000, { kind: "custom" })]);
    expect(out).toEqual([
      { goalKind: "emergency", milestone: 25 },
      { goalKind: "custom", milestone: 25 },
      { goalKind: "custom", milestone: 50 },
    ]);
  });
  it("counts a new goal from zero and skips goals without a target", () => {
    expect(crossingsBetween([], [g("n", 1_300_000)])).toEqual([{ goalKind: "emergency", milestone: 25 }]);
    expect(crossingsBetween([g("a", 0)], [g("a", 100, { targetMinor: 0 })])).toEqual([]);
  });
});
