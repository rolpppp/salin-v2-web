import { describe, expect, it } from "vitest";
import { APP_STEPS, WEB_STEPS, draftSchema, emptyDraft, planOnlySteps, readDraft } from "./draft";

describe("onboarding draft contract", () => {
  it("an empty draft is valid", () => expect(draftSchema.safeParse(emptyDraft()).success).toBe(true));
  it("unreadable or old drafts start fresh", () => {
    expect(readDraft({})).toEqual(emptyDraft());
    expect(readDraft({ ...emptyDraft(), v: 0 })).toEqual(emptyDraft());
    expect(readDraft(null)).toEqual(emptyDraft());
  });
  it("homes may name only some buckets", () => {
    const d = { ...emptyDraft(), homes: { living: "acc-1" } };
    expect(draftSchema.safeParse(d).success).toBe(true);
  });
  it("money is integer centavos", () => {
    const d = emptyDraft();
    expect(draftSchema.safeParse({ ...d, billsMinor: 12.5 }).success).toBe(false);
    expect(draftSchema.safeParse({ ...d, billsMinor: 1_000_000_001 }).success).toBe(false);
  });
  it("step lists match SPEC §7.3, §7.4, §7.6", () => {
    expect(WEB_STEPS).toHaveLength(6);
    expect(APP_STEPS).toHaveLength(7);
    expect(planOnlySteps("app")).toEqual(["prio", "plan", "homes", "cats"]);
  });
});
