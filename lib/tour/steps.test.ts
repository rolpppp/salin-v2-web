import { describe, expect, it } from "vitest";
import { TOUR_STEPS, stepsFor } from "./steps";

const all = () => true;

describe("tour steps", () => {
  it("simple view: today's number first, then the daily actions; ends on switching views", () => {
    const ids = stepsFor("simple", all).map((s) => s.id);
    expect(ids[0]).toBe("hero");
    expect(ids).toContain("actions");
    expect(ids).not.toContain("shelf");
    expect(ids.at(-1)).toBe("avatar-simple");
  });

  it("full view: safe to spend first, then each tab in nav order, ends on switching views", () => {
    const ids = stepsFor("full", all).map((s) => s.id);
    expect(ids[0]).toBe("safe");
    const paths = stepsFor("full", all).flatMap((s) => (s.path && s.path !== "/today" ? [s.path] : []));
    expect([...new Set(paths)]).toEqual(["/money-in", "/review", "/plans/split"]);
    expect(ids).not.toContain("hero");
    expect(ids.at(-1)).toBe("avatar-full");
  });

  it("leaves out a header step whose element is missing; page steps wait until the tour gets there", () => {
    const ids = stepsFor("full", (t) => t !== "bell" && t !== "shelf").map((s) => s.id);
    expect(ids).not.toContain("bell");
    expect(ids).toContain("shelf");
    expect(ids).toContain("help");
  });

  it("simple view visits every tab too", () => {
    const paths = new Set(stepsFor("simple", all).map((s) => s.path));
    expect(paths).toEqual(new Set(["/today", "/money-in", "/review", "/plans/split", null]));
  });

  it("every step has a target, a short title and a body", () => {
    for (const s of TOUR_STEPS) {
      expect(s.target).toMatch(/^[a-z-]+$/);
      expect(s.title.length).toBeLessThanOrEqual(30);
      expect(s.body.length).toBeGreaterThan(20);
    }
  });
});
