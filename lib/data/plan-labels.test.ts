import { describe, expect, it } from "vitest";
import { BUCKET, buckets, income, moneyInData, sources } from "./money-in-testkit";
import { doneHow, hueVar, jobText, ruleJobText, whyText, type Preview } from "./money-in-model";
import { BUILTIN_HUES, CUSTOM_HUES, HUE_LABELS, isBuiltinHue } from "./hues";
import { joinPlanNames, planLabel } from "./plan-labels";

const NAMES = { A: "Plan A", B: "Plan B", p_1a2b3c4d: "Saving for Japan" };

describe("plan labels", () => {
  it("uses the plan's name, and falls back to Plan {key}", () => {
    expect(planLabel(NAMES, "p_1a2b3c4d")).toBe("Saving for Japan");
    expect(planLabel(NAMES, "A")).toBe("Plan A");
    expect(planLabel(undefined, "B")).toBe("Plan B");
    expect(planLabel({ A: "  " }, "A")).toBe("Plan A");
  });
  it("joins names for a sentence", () => {
    expect(joinPlanNames([])).toBe("");
    expect(joinPlanNames(["Plan A"])).toBe("Plan A");
    expect(joinPlanNames(["Plan A", "Plan B"])).toBe("Plan A and Plan B");
    expect(joinPlanNames(["Plan A", "Saving for Japan", "Plan B"])).toBe("Plan A, Saving for Japan and Plan B");
  });
});

describe("plan names on Money in", () => {
  const data = moneyInData({ incomes: [income("x", "others", 100_000, 8)] });
  const ctx = { planNames: NAMES };
  const ready = (planKey: string): Preview => ({ kind: "ready", job: "plan", planKey, lines: [], bps: new Map() });

  it("the job line says 'Split by {name}'", () => {
    expect(jobText(ready("p_1a2b3c4d"), data.incomes[0], sources[0], buckets, ctx)).toBe("Split by Saving for Japan");
    expect(jobText(ready("A"), data.incomes[0], sources[0], buckets, ctx)).toBe("Split by Plan A");
  });
  it("the Add income rule line and the done list use the name too", () => {
    expect(ruleJobText(sources[1], buckets, "p_1a2b3c4d", ctx)).toEqual({ kind: "job", text: "Split by Saving for Japan" });
    expect(doneHow({ job: "plan", planKey: "p_1a2b3c4d" }, [], ctx)).toBe("Split by Saving for Japan");
    expect(doneHow({ job: "plan", planKey: "B" }, [], ctx)).toBe("Split by Plan B");
  });
  it("the 'why' names the plan", () => {
    const auto = { ...data, plan: { ...data.plan, planNames: NAMES, activePlan: { mode: "auto" as const, from: "A", to: "p_1a2b3c4d" } } };
    expect(whyText(ready("p_1a2b3c4d"), data.incomes[0], auto)).toContain("Saving for Japan applies now that the Emergency fund reached");
    expect(whyText(ready("A"), data.incomes[0], auto)).toContain("Plan A runs until the Emergency fund reaches");
  });
});

describe("hue tokens", () => {
  it("maps built-in and custom hues, and falls back for unknown ones", () => {
    expect(hueVar("living")).toBe("var(--b-living)");
    expect(hueVar("c3")).toBe("var(--b-c3)");
    expect(hueVar("c9")).toBe("var(--b-buffer)");
    expect(hueVar(null)).toBe("var(--b-buffer)");
    expect(hueVar("nope", "var(--ink-3)")).toBe("var(--ink-3)");
    expect(BUCKET.living).toBeTruthy();
  });
  it("built-ins are recognised, custom ones are not", () => {
    for (const h of BUILTIN_HUES) expect(isBuiltinHue(h)).toBe(true);
    for (const h of CUSTOM_HUES) expect(isBuiltinHue(h)).toBe(false);
  });
  it("every palette colour has a spoken name and a token in the stylesheet", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/globals.css", "utf8");
    for (const h of CUSTOM_HUES) {
      expect(HUE_LABELS[h]).toBeTruthy();
      expect(css).toContain(`--b-${h}:`);
      expect(css).toContain(`--hue-${h}:`);
      // light block + both dark blocks
      expect(css.match(new RegExp(`--b-${h}:`, "g"))?.length).toBe(3);
    }
  });
});
