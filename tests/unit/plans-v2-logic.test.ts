import { describe, expect, it } from "vitest";
import {
  afterReasonCheck,
  autoActiveKey,
  canSave,
  checkPlan,
  choiceFromSettings,
  choiceProblem,
  copyName,
  nameProblem,
  orderPlanChips,
  sameChoice,
  saveNote,
  scratchDraft,
  shareOfPay,
  stepPercent,
  totalHint,
} from "@/components/plans/split/logic";
import { parsePlanSettings } from "@/lib/data/plans";

const ids = ["a", "b", "c"];

describe("plan bar ordering", () => {
  it("puts the plan that splits paydays first, the rest in the order they were made", () => {
    const plans = [
      { key: "A", name: "Plan A" },
      { key: "B", name: "Plan B" },
      { key: "p_12345678", name: "Saving for Japan" },
    ];
    expect(orderPlanChips(plans, "B").map((c) => c.key)).toEqual(["B", "A", "p_12345678"]);
    expect(orderPlanChips(plans, "B")[0].isActive).toBe(true);
    expect(orderPlanChips(plans, "A").map((c) => c.key)).toEqual(["A", "B", "p_12345678"]);
    expect(orderPlanChips(plans, "gone").some((c) => c.isActive)).toBe(false);
  });
});

describe("from-scratch draft totals and Save", () => {
  it("starts at 0% everywhere, 0% total, Save off", () => {
    const d = scratchDraft(ids);
    const c = checkPlan(d, ids);
    expect(d).toEqual({ a: "0", b: "0", c: "0" });
    expect(c.total).toBe(0);
    expect(canSave(c, { isNew: true, dirty: true, busy: false, hasName: true })).toBe(false);
    expect(totalHint(c)).toBe("Adds up to 0%. Give 100% to a bucket.");
  });
  it("Save turns on at exactly 100 and needs a name for a new plan", () => {
    const c = checkPlan({ a: "60", b: "40", c: "0" }, ids);
    expect(c.valid).toBe(true);
    expect(canSave(c, { isNew: true, dirty: true, busy: false, hasName: true })).toBe(true);
    expect(canSave(c, { isNew: true, dirty: true, busy: false, hasName: false })).toBe(false);
    expect(canSave(c, { isNew: true, dirty: true, busy: true, hasName: true })).toBe(false);
  });
  it("an existing plan saves only when changed and valid", () => {
    const ok = checkPlan({ a: "50", b: "50", c: "0" }, ids);
    expect(canSave(ok, { isNew: false, dirty: false, busy: false, hasName: true })).toBe(false);
    expect(canSave(ok, { isNew: false, dirty: true, busy: false, hasName: true })).toBe(true);
    const short = checkPlan({ a: "45", b: "50", c: "0" }, ids);
    expect(canSave(short, { isNew: false, dirty: true, busy: false, hasName: true })).toBe(false);
  });
  it("totals text says how to fix it, both ways", () => {
    expect(totalHint(checkPlan({ a: "50", b: "45", c: "0" }, ids))).toBe("Adds up to 95%. Give 5% to a bucket.");
    expect(totalHint(checkPlan({ a: "60", b: "45", c: "0" }, ids))).toBe("Adds up to 105%. Take 5% from a bucket.");
    expect(totalHint(checkPlan({ a: "50", b: "50", c: "0" }, ids))).toBe("");
    expect(totalHint(checkPlan({ a: "5x", b: "50", c: "0" }, ids), "Fun")).toBe("Fun needs a whole number from 0 to 100.");
  });
  it("the note beside Save says the last saved version stays active", () => {
    const short = checkPlan({ a: "10", b: "0", c: "0" }, ids);
    expect(saveNote(short, { isNew: false, dirty: true })).toContain("last saved version is still used");
    expect(saveNote(short, { isNew: true, dirty: true })).toContain("Not created yet");
    expect(saveNote(checkPlan({ a: "100", b: "0", c: "0" }, ids), { isNew: false, dirty: true })).toContain("Save to use it");
  });
  it("stepper stays inside 0..100 and reads bad text as 0", () => {
    expect(stepPercent("5", 1)).toBe("6");
    expect(stepPercent("0", -1)).toBe("0");
    expect(stepPercent("100", 1)).toBe("100");
    expect(stepPercent("", 1)).toBe("1");
    expect(stepPercent("x", 1)).toBe("1");
  });
  it("pesos per pay are whole centavos, rounded down", () => {
    expect(shareOfPay(2_300_000, 30)).toBe(690_000);
    expect(shareOfPay(10_001, 33)).toBe(3_300);
  });
});

describe("names", () => {
  it("suggests an unused 'Copy of' name within 40 characters", () => {
    expect(copyName("Plan A", ["Plan A", "Plan B"])).toBe("Copy of Plan A");
    expect(copyName("Plan A", ["Plan A", "copy of plan a"])).toBe("Copy of Plan A 2");
    expect(copyName("Plan A", ["Copy of Plan A", "Copy of Plan A 2"])).toBe("Copy of Plan A 3");
    expect(copyName("x".repeat(40), []).length).toBeLessThanOrEqual(40);
    expect(copyName("x".repeat(40), ["Copy of " + "x".repeat(32)]).length).toBeLessThanOrEqual(40);
  });
  it("checks empty, long and duplicate names (case-insensitive)", () => {
    expect(nameProblem("  ", [])).toBe("Give it a name.");
    expect(nameProblem("x".repeat(41), [])).toMatch(/40 characters/);
    expect(nameProblem("plan a", ["Plan A"])).toMatch(/already have/);
    expect(nameProblem(" Japan ", ["Plan A"])).toBeNull();
  });
});

describe("which plan splits paydays", () => {
  const keys = ["A", "B", "p_1"];
  it("round-trips the saved setting", () => {
    expect(choiceFromSettings({ mode: "manual", activeKey: "p_1", autoFrom: "A", autoTo: "B" })).toEqual({ mode: "manual", planKey: "p_1" });
    expect(choiceFromSettings({ mode: "auto", activeKey: "A", autoFrom: "A", autoTo: "B" })).toEqual({ mode: "auto", from: "A", to: "B" });
  });
  it("compares choices", () => {
    expect(sameChoice({ mode: "auto", from: "A", to: "B" }, { mode: "auto", from: "A", to: "B" })).toBe(true);
    expect(sameChoice({ mode: "auto", from: "A", to: "B" }, { mode: "manual", planKey: "A" })).toBe(false);
    expect(sameChoice({ mode: "manual", planKey: "A" }, { mode: "manual", planKey: "B" })).toBe(false);
  });
  it("refuses an automatic switch from a plan to itself, or a plan that doesn't exist", () => {
    expect(choiceProblem({ mode: "auto", from: "A", to: "A" }, keys)).toMatch(/two different plans/);
    expect(choiceProblem({ mode: "auto", from: "A", to: "zzz" }, keys)).toMatch(/Pick two/);
    expect(choiceProblem({ mode: "auto", from: "A", to: "p_1" }, keys)).toBeNull();
    expect(choiceProblem({ mode: "manual", planKey: "zzz" }, keys)).toMatch(/Pick one/);
    expect(choiceProblem({ mode: "manual", planKey: "p_1" }, keys)).toBeNull();
  });
  it("auto uses from until Emergency reaches the target", () => {
    expect(autoActiveKey("A", "B", 4_999_999, 5_000_000)).toBe("A");
    expect(autoActiveKey("A", "B", 5_000_000, 5_000_000)).toBe("B");
    expect(autoActiveKey("A", "B", 9_000_000, null)).toBe("A");
  });
  it("parses plan_settings() and defaults to auto A to B", () => {
    expect(parsePlanSettings(null)).toMatchObject({ mode: "auto", activeKey: "A", autoFrom: "A", autoTo: "B", targetMinor: null });
    expect(parsePlanSettings({ mode: "manual", activeKey: "p_1", autoFrom: "A", autoTo: "B", targetMinor: 5_000_000, emergencyBucketId: "e", plans: [] })).toMatchObject({
      mode: "manual",
      activeKey: "p_1",
      targetMinor: 5_000_000,
      emergencyBucketId: "e",
    });
    expect(parsePlanSettings({ targetMinor: 0 }).targetMinor).toBeNull();
  });
});

describe("archive flow", () => {
  it("a reason blocks the archive and is shown as given", () => {
    expect(afterReasonCheck({ ok: true, reason: "Fun money still has ₱120.00 in it." })).toEqual({ next: { kind: "blocked", reason: "Fun money still has ₱120.00 in it." }, archive: false });
  });
  it("no reason lets the archive go ahead", () => {
    expect(afterReasonCheck({ ok: true, reason: null })).toEqual({ next: { kind: "checking" }, archive: true });
  });
  it("a failed check says so and does not archive", () => {
    expect(afterReasonCheck({ ok: false, error: "Couldn't save." })).toEqual({ next: { kind: "failed", error: "Couldn't save." }, archive: false });
  });
});
