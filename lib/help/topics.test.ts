import { describe, expect, it } from "vitest";
import { HELP_TOPICS, helpTopic, topicForPath } from "./topics";

describe("help topics", () => {
  it("have unique ids and every part filled in", () => {
    expect(new Set(HELP_TOPICS.map((t) => t.id)).size).toBe(HELP_TOPICS.length);
    for (const t of HELP_TOPICS) {
      expect(t.title.length).toBeGreaterThan(2);
      expect(t.summary.length).toBeGreaterThan(20);
      expect(t.how.length).toBeGreaterThanOrEqual(2);
      expect(t.tip.length).toBeGreaterThan(10);
    }
  });
  it("every page maps to an existing topic", () => {
    for (const p of ["/today", "/money-in", "/review", "/plans/split", "/plans/income", "/plans/accounts", "/plans/categories", "/plans/goals", "/plans"]) {
      for (const v of ["simple", "full", undefined] as const) expect(helpTopic(topicForPath(p, v))).toBeDefined();
    }
  });
  it("Today follows the view; Plans pages follow their section", () => {
    expect(topicForPath("/today", "simple")).toBe("daily");
    expect(topicForPath("/today", "full")).toBe("buckets");
    expect(topicForPath("/plans/accounts", "full")).toBe("accounts");
    expect(topicForPath("/plans/split", "simple")).toBe("plans");
  });
});
