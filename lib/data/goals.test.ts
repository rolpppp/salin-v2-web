import { describe, expect, it } from "vitest";
import { buildGoals, feedText, goalSaved, minorToInput } from "./goals";

describe("goalSaved (BR 7.1)", () => {
  it("Emergency (Plan B switch goal): saved = the bucket's left amount", () => {
    expect(goalSaved({ isPlanSwitch: true, linkedShareBp: 10_000 }, { allocated: 2_000_000, left: 1_290_528 })).toBe(1_290_528);
  });
  it("PC Build: 50% of Sinking's allocations", () => {
    expect(goalSaved({ isPlanSwitch: false, linkedShareBp: 5_000 }, { allocated: 403_290, left: 1 })).toBe(201_645);
  });
  it("floors the share (never overstates) and stays integer", () => {
    expect(goalSaved({ isPlanSwitch: false, linkedShareBp: 3_333 }, { allocated: 1_001, left: 0 })).toBe(333);
  });
  it("unlinked, or nothing in the bucket, starts at 0; an overspent bucket is never negative", () => {
    expect(goalSaved({ isPlanSwitch: false, linkedShareBp: 10_000 }, null)).toBe(0);
    expect(goalSaved({ isPlanSwitch: true, linkedShareBp: 10_000 }, { allocated: 0, left: -8_697 })).toBe(0);
  });
});

describe("buildGoals", () => {
  it("G10: Emergency at 1290528 of 5000000 is 25.8%", () => {
    const [g] = buildGoals({
      goals: [{ id: "g", name: "Emergency fund", targetMinor: 5_000_000, currency: "PHP", linkedBucketId: "em", linkedShareBp: 10_000, isPlanSwitch: true }],
      buckets: [{ id: "em", name: "Emergency fund" }],
      flows: new Map([["em", { allocated: 1_290_528, left: 1_290_528 }]]),
    });
    expect(g.savedMinor).toBe(1_290_528);
    expect(g.progressBp).toBe(2_581);
    expect(g.feed).toBe("Fed from all of Emergency fund");
  });
  it("caps progress at 100%", () => {
    const [g] = buildGoals({
      goals: [{ id: "g", name: "Done", targetMinor: 1_000, currency: "PHP", linkedBucketId: "b", linkedShareBp: 10_000, isPlanSwitch: false }],
      buckets: [{ id: "b", name: "B" }],
      flows: new Map([["b", { allocated: 5_000, left: 5_000 }]]),
    });
    expect(g.progressBp).toBe(10_000);
  });
});

describe("feedText", () => {
  it("says what feeds the goal", () => {
    expect(feedText(null, 10_000)).toBe("Not linked to a bucket yet");
    expect(feedText("Sinking", 5_000)).toBe("Fed from 50% of Sinking");
    expect(feedText("Sinking", 2_550)).toBe("Fed from 25.50% of Sinking");
  });
});

describe("minorToInput", () => {
  it.each([
    [5_000_000, "50,000"],
    [5_000_050, "50,000.50"],
    [5, "0.05"],
    [100, "1"],
  ])("%i -> %s", (minor, text) => expect(minorToInput(minor)).toBe(text));
});
