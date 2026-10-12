import { describe, expect, it } from "vitest";
import { emptyDraft } from "./draft";
import { nextStepId, prevStepId, resolveRoute, stepHref, stepParamFrom, stepsFor } from "./route";
import { appDraft } from "./testkit";

describe("stepsFor", () => {
  it("picks the list from the path, and the shorter one for Make a plan", () => {
    expect(stepsFor(emptyDraft())).toEqual([]);
    expect(stepsFor({ path: "web", planOnly: false })).toEqual(["income", "accounts", "prio", "plan", "homes", "first"]);
    expect(stepsFor({ path: "app", planOnly: false })).toEqual(["app", "income", "prio", "plan", "homes", "cats", "first"]);
    expect(stepsFor({ path: "web", planOnly: true })).toEqual(["prio", "plan", "homes"]);
    expect(stepsFor({ path: "app", planOnly: true })).toEqual(["prio", "plan", "homes", "cats"]);
  });

  it("next and previous follow the list", () => {
    const s = stepsFor({ path: "web", planOnly: false });
    expect(nextStepId(s, "income")).toBe("accounts");
    expect(nextStepId(s, "first")).toBeNull();
    expect(prevStepId(s, "income")).toBeNull();
    expect(prevStepId(s, "plan")).toBe("prio");
  });
});

describe("stepParamFrom / stepHref", () => {
  it("round-trips", () => {
    expect(stepParamFrom("/welcome")).toBeNull();
    expect(stepParamFrom("/welcome/")).toBeNull();
    expect(stepParamFrom("/welcome/income")).toBe("income");
    expect(stepHref("plan")).toBe("/welcome/plan");
    expect(stepHref("welcome")).toBe("/welcome");
  });
});

describe("resolveRoute", () => {
  const go = (param: string | null, draft = emptyDraft(), autoDetected = false, resume = true) => resolveRoute({ param, draft, autoDetected, resume });

  it("/welcome shows the question for a fresh user", () => {
    expect(go(null).view).toEqual({ kind: "welcome" });
  });

  it("/welcome resumes at draft.step on a first load, but not after navigating inside the app", () => {
    const d = { ...emptyDraft(), path: "web" as const, step: "accounts" as const };
    expect(go(null, d).view).toEqual({ kind: "redirect", to: "/welcome/accounts" });
    expect(go(null, d, false, false).view).toEqual({ kind: "welcome" });
  });

  it("auto-detected synced rows skip the question and start the app path (D-29)", () => {
    expect(go(null, emptyDraft(), true).view).toEqual({ kind: "redirect", to: "/welcome/app" });
    const r = go("app", emptyDraft(), true);
    expect(r.view).toEqual({ kind: "step", id: "app" });
    expect(r.draft).toMatchObject({ path: "app", step: "app" });
  });

  it("a step follows the URL: draft.step is brought in line so a refresh resumes here", () => {
    const d = { ...emptyDraft(), path: "web" as const, step: "income" as const };
    const r = go("accounts", d);
    expect(r.view).toEqual({ kind: "step", id: "accounts" });
    expect(r.draft.step).toBe("accounts");
  });

  it("refuses ids that aren't steps, and steps that belong to the other path", () => {
    expect(go("nope").view).toEqual({ kind: "redirect", to: "/welcome" });
    expect(go("welcome").view).toEqual({ kind: "redirect", to: "/welcome" });
    // No path chosen yet and not the app step: back to the question.
    expect(go("income").view).toEqual({ kind: "redirect", to: "/welcome" });
    // "cats" isn't on the web path: send them to where they were.
    const web = { ...emptyDraft(), path: "web" as const, step: "accounts" as const };
    expect(go("cats", web).view).toEqual({ kind: "redirect", to: "/welcome/accounts" });
  });

  it("just tracking skips Your plan: First pay follows Priorities, and a deep link to the plan goes back to where they were", () => {
    const d = { ...emptyDraft(), path: "web" as const, step: "prio" as const, skipped: true };
    expect(nextStepId(stepsFor(d), "prio")).toBe("first");
    expect(prevStepId(stepsFor(d), "first")).toBe("prio");
    expect(go("first", d).view).toEqual({ kind: "step", id: "first" });
    expect(go("plan", d).view).toEqual({ kind: "redirect", to: "/welcome/prio" });
    expect(go("homes", d).view).toEqual({ kind: "redirect", to: "/welcome/prio" });
  });

  it("Make a plan re-entry only has its own steps", () => {
    const d = appDraft({ planOnly: true, step: "prio" });
    expect(go("prio", d).view).toEqual({ kind: "step", id: "prio" });
    expect(go("income", d).view).toEqual({ kind: "redirect", to: "/welcome/prio" });
  });
});
