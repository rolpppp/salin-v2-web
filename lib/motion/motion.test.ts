import { describe, expect, it } from "vitest";
import { countValue, easeOutQuart } from "./countUp";
import { clipStartPercent, growAnnouncement, growFrom, parseGrow } from "./grow";

describe("parseGrow", () => {
  it("accepts only the two known modes", () => {
    expect(parseGrow("confirm")).toBe("confirm");
    expect(parseGrow("onboarding")).toBe("onboarding");
    expect(parseGrow(["confirm", "onboarding"])).toBe("confirm");
    expect(parseGrow("payday")).toBeNull();
    expect(parseGrow("")).toBeNull();
    expect(parseGrow(undefined)).toBeNull();
    expect(parseGrow(null)).toBeNull();
  });
});

describe("growFrom", () => {
  it("onboarding always starts at zero", () => {
    expect(growFrom("onboarding", 5_000)).toBe(0);
  });
  it("confirm starts at the previous value, or zero when there isn't one", () => {
    expect(growFrom("confirm", 5_000)).toBe(5_000);
    expect(growFrom("confirm", -300)).toBe(-300);
    expect(growFrom("confirm", null)).toBe(0);
    expect(growFrom("confirm", undefined)).toBe(0);
    expect(growFrom("confirm", Number.NaN)).toBe(0);
  });
});

describe("clipStartPercent", () => {
  it("hides the part of the ribbon that wasn't there before", () => {
    expect(clipStartPercent(0, 1_000)).toBe(100);
    expect(clipStartPercent(250, 1_000)).toBe(75);
    expect(clipStartPercent(-50, 1_000)).toBe(100);
  });
  it("hides nothing when it didn't grow", () => {
    expect(clipStartPercent(1_000, 1_000)).toBe(0);
    expect(clipStartPercent(2_000, 1_000)).toBe(0);
    expect(clipStartPercent(0, 0)).toBe(0);
  });
});

describe("count-up values", () => {
  it("is an integer at every step and lands exactly on the target", () => {
    for (let i = 0; i <= 20; i++) expect(Number.isInteger(countValue(0, 1_732_900, i / 20))).toBe(true);
    expect(countValue(0, 1_732_900, 0)).toBe(0);
    expect(countValue(0, 1_732_900, 1)).toBe(1_732_900);
    expect(countValue(500, 100, 1)).toBe(100);
  });
  it("eases out: more than half the way at the halfway point", () => {
    expect(easeOutQuart(0.5)).toBeGreaterThan(0.9);
    expect(countValue(0, 1_000, 0.5)).toBeGreaterThan(900);
  });
});

describe("growAnnouncement", () => {
  it("says what changed so motion is never the only signal", () => {
    expect(growAnnouncement("confirm", { totalMinor: 1_732_900, passed: [{ name: "Emergency fund", milestone: 25 }] })).toBe(
      "Your buckets are updated. ₱17,329.00 in all buckets. Emergency fund passed 25%.",
    );
    expect(growAnnouncement("onboarding", { totalMinor: null, passed: [] })).toBe("Your plan is set.");
  });
});
