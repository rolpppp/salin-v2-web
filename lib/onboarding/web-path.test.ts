import { describe, expect, it } from "vitest";
import { AccountType } from "@/lib/domain/enums";
import { draftSchema, emptyDraft, type OnboardingDraft } from "./draft";
import { skipPatch } from "./priorities";
import { stepsFor } from "./route";
import {
  accountChips,
  accountIdFor,
  addCustomAccount,
  buildSources,
  extraKinds,
  makePlanDraft,
  setIncome,
  setLanding,
  toggleAccount,
  toggleExtra,
  undoSkipOnBack,
  validateWebAccounts,
  validateWebIncome,
  webIncomeOnEnter,
} from "./web-path";
import { ctx } from "./testkit";

const web = (over: Partial<OnboardingDraft> = {}): OnboardingDraft => ({ ...emptyDraft(), path: "web", step: "income", ...over });
const apply = (d: OnboardingDraft, p: Partial<OnboardingDraft>): OnboardingDraft => ({ ...d, ...p });
const webCtx = ctx({ path: "web" });

describe("web Income", () => {
  it("entering fills monthly and the main source", () => {
    const d = apply(web(), webIncomeOnEnter(web()) ?? {});
    expect(d.income.frequency).toBe("monthly");
    expect(d.sources).toHaveLength(1);
    expect(d.sources[0]).toMatchObject({ key: "main", name: "Salary", kind: "salary", rule: "plan", isMain: true });
    expect(webIncomeOnEnter(d)).toBeNull();
  });

  it("each extra chip becomes a source with its kind's default rule (SPEC §4.2)", () => {
    let d = apply(web(), webIncomeOnEnter(web()) ?? {});
    for (const k of ["side_hustle", "scholarship", "allowance", "gift"] as const) d = apply(d, toggleExtra(d, k));
    const by = Object.fromEntries(d.sources.map((s) => [s.key, s]));
    expect(by.main?.isMain).toBe(true);
    expect(by.side_hustle).toMatchObject({ rule: "own", ownSplit: { tax: 10, sinking: 40, fun: 50 } });
    expect(by.scholarship).toMatchObject({ rule: "whole", wholeBucket: "scholarship" });
    expect(by.allowance).toMatchObject({ rule: "whole", wholeBucket: "living" });
    expect(by.gift).toMatchObject({ rule: "ask" });
    expect(d.sources.filter((s) => s.isMain)).toHaveLength(1);
    // The schema accepts it, and own splits total 100.
    expect(draftSchema.safeParse(d).success).toBe(true);
    const own = by.side_hustle?.ownSplit ?? {};
    expect(Object.values(own).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
    // Untick removes it.
    expect(extraKinds(apply(d, toggleExtra(d, "gift")))).toEqual(["side_hustle", "scholarship", "allowance"]);
  });

  it("choosing the main kind drops the same kind from the extras and renames the main source", () => {
    let d = apply(web(), toggleExtra(web(), "scholarship"));
    d = apply(d, setIncome(d, { kind: "scholarship" }));
    expect(d.sources.map((s) => s.key)).toEqual(["main"]);
    expect(d.sources[0]).toMatchObject({ name: "Scholarship", kind: "scholarship", rule: "plan" });
  });

  it("source names stay unique (Finish refuses duplicates)", () => {
    const names = buildSources("allowance", ["side_hustle", "scholarship", "allowance", "gift"], null).map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("validates name, amount, payday and frequency with the field to focus", () => {
    const ok = apply(web({ firstName: "Rolf" }), setIncome(web(), { amountMinor: 2_500_000, nextPayday: "2026-10-20", frequency: "monthly" }));
    expect(validateWebIncome(ok, webCtx)).toBeNull();
    expect(validateWebIncome({ ...ok, firstName: "  " }, webCtx)?.field).toBe("ob-name");
    expect(validateWebIncome({ ...ok, firstName: "x".repeat(41) }, webCtx)?.field).toBe("ob-name");
    expect(validateWebIncome(apply(ok, setIncome(ok, { amountMinor: null })), webCtx)?.field).toBe("ob-amount");
    expect(validateWebIncome(apply(ok, setIncome(ok, { amountMinor: 0 })), webCtx)?.field).toBe("ob-amount");
    expect(validateWebIncome(apply(ok, setIncome(ok, { amountMinor: 1_000_000_001 })), webCtx)?.field).toBe("ob-amount");
    expect(validateWebIncome(apply(ok, setIncome(ok, { nextPayday: null })), webCtx)?.field).toBe("ob-next-payday");
    expect(validateWebIncome(apply(ok, setIncome(ok, { nextPayday: "2026-10-11" })), webCtx)?.message).toMatch(/today or later/);
    expect(validateWebIncome(apply(ok, setIncome(ok, { nextPayday: webCtx.todayIso })), webCtx)).toBeNull();
    expect(validateWebIncome(apply(ok, setIncome(ok, { frequency: null })), webCtx)?.field).toBe("ob-freq-monthly");
  });
});

describe("web Accounts", () => {
  const USER = "user-1";
  const gcash = { name: "GCash", type: "eWallet" as const };
  const bpi = { name: "BPI", type: "bank" as const };

  it("a picked account gets a UUID and isNew; unpick and repick keeps the same id", () => {
    let d = web();
    d = apply(d, toggleAccount(d, USER, gcash, true));
    const id = d.accounts[0]!.id;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(d.accounts[0]).toMatchObject({ name: "GCash", type: "eWallet", currency: "PHP", isNew: true });
    d = apply(d, toggleAccount(d, USER, gcash, false));
    expect(d.accounts).toEqual([]);
    d = apply(d, toggleAccount(d, USER, gcash, true));
    expect(d.accounts[0]!.id).toBe(id);
    // Ticking twice changes nothing.
    expect(toggleAccount(d, USER, gcash, true)).toEqual({});
    expect(accountIdFor(USER, "gcash")).toBe(id);
    expect(accountIdFor("someone-else", "GCash")).not.toBe(id);
  });

  it("keeps chip order: presets first, then custom accounts", () => {
    let d = web();
    const added = addCustomAccount(d, USER, "Security Bank", "bank");
    if (!added.ok) throw new Error("expected ok");
    d = apply(d, added.patch);
    d = apply(d, toggleAccount(d, USER, bpi, true));
    d = apply(d, toggleAccount(d, USER, gcash, true));
    expect(d.accounts.map((a) => a.name)).toEqual(["GCash", "BPI", "Security Bank"]);
    expect(accountChips(d).at(-1)).toMatchObject({ name: "Security Bank", custom: true, label: "Bank" });
    expect(draftSchema.safeParse(d).success).toBe(true);
  });

  it("custom accounts: trimmed, no duplicates, no presets, length-limited", () => {
    let d = web();
    expect(addCustomAccount(d, USER, "   ", "bank")).toMatchObject({ ok: false });
    expect(addCustomAccount(d, USER, "x".repeat(41), "bank")).toMatchObject({ ok: false });
    expect(addCustomAccount(d, USER, "gcash", "bank")).toMatchObject({ ok: false, message: expect.stringContaining("Tick it") });
    const r = addCustomAccount(d, USER, "  Security   Bank ", "savings");
    if (!r.ok) throw new Error("expected ok");
    expect(r.name).toBe("Security Bank");
    d = apply(d, r.patch);
    expect(d.accounts[0]).toMatchObject({ type: "savings", isNew: true });
    expect(addCustomAccount(d, USER, "security bank", "bank")).toMatchObject({ ok: false });
  });

  it("landing sets every source's landsInAccountId; unticking the landing account clears both", () => {
    let d = apply(web(), webIncomeOnEnter(web()) ?? {});
    d = apply(d, toggleExtra(d, "allowance"));
    d = apply(d, toggleAccount(d, USER, gcash, true));
    d = apply(d, toggleAccount(d, USER, bpi, true));
    const bpiId = d.accounts.find((a) => a.name === "BPI")!.id;
    d = apply(d, setLanding(d, bpiId));
    expect(d.landingAccountId).toBe(bpiId);
    expect(d.sources.map((s) => s.landsInAccountId)).toEqual([bpiId, bpiId]);
    // A later income change keeps the landing account.
    d = apply(d, setIncome(d, { kind: "side_hustle" }));
    expect(d.sources.every((s) => s.landsInAccountId === bpiId)).toBe(true);
    // Unticking another account leaves it; unticking the landing account clears it.
    d = apply(d, toggleAccount(d, USER, gcash, false));
    expect(d.landingAccountId).toBe(bpiId);
    d = apply(d, toggleAccount(d, USER, bpi, false));
    expect(d.landingAccountId).toBeNull();
    expect(d.sources.every((s) => s.landsInAccountId === null)).toBe(true);
  });

  it("validates at least one account, then a landing account", () => {
    expect(validateWebAccounts(web())?.field).toBe("ob-acct-0");
    let d = apply(web(), toggleAccount(web(), USER, gcash, true));
    expect(validateWebAccounts(d)).toMatchObject({ field: "ob-landed", message: "Pick where your pay lands." });
    d = apply(d, setLanding(d, d.accounts[0]!.id));
    expect(validateWebAccounts(d)).toBeNull();
    expect(validateWebAccounts({ ...d, landingAccountId: "gone" })?.field).toBe("ob-landed");
  });
});

describe("Just track for now (SPEC §7.6)", () => {
  const landed = (): OnboardingDraft => {
    let d = apply(web({ firstName: "Rolf" }), webIncomeOnEnter(web()) ?? {});
    d = apply(d, toggleAccount(d, "u", { name: "BPI", type: "bank" }, true));
    return apply(d, setLanding(d, d.accounts[0]!.id));
  };

  it("a skipped draft's step list leaves out plan, homes and categories; Make a plan keeps its own", () => {
    expect(stepsFor({ path: "web", planOnly: false, skipped: true })).toEqual(["income", "accounts", "prio", "first"]);
    expect(stepsFor({ path: "app", planOnly: false, skipped: true })).toEqual(["app", "income", "prio", "first"]);
    expect(stepsFor({ path: "web", planOnly: false, skipped: false })).toEqual(["income", "accounts", "prio", "plan", "homes", "first"]);
    expect(stepsFor({ path: "web", planOnly: true, skipped: false })).toEqual(["prio", "plan", "homes"]);
  });

  it("the skip patch is already the one-bucket plan Finish writes: Spending 100, no Plan B, homes = landing, no goal", () => {
    const d = apply(landed(), skipPatch(landed()));
    expect(d.skipped).toBe(true);
    expect(d.planA).toMatchObject({ living: 100, rent: 0, fun: 0, emergency: 0, invest: 0, sinking: 0, tax: 0, buffer: 0 });
    expect(d.planBOn).toBe(false);
    expect(d.goal).toBeNull();
    expect(new Set(Object.values(d.homes ?? {}))).toEqual(new Set([d.landingAccountId]));
    expect(draftSchema.safeParse(d).success).toBe(true);
  });

  it("Back from First pay undoes the skip; nowhere else does", () => {
    const skipped = apply(landed(), skipPatch(landed()));
    const undo = undoSkipOnBack(skipped, "first");
    expect(undo).not.toBeNull();
    const back = apply(skipped, undo!);
    expect(back.skipped).toBe(false);
    expect(back.planA).toBeNull();
    expect(back.homes).toBeNull();
    expect(stepsFor(back)).toContain("plan");
    expect(draftSchema.safeParse(back).success).toBe(true);
    expect(undoSkipOnBack(skipped, "prio")).toBeNull();
    expect(undoSkipOnBack(landed(), "first")).toBeNull();
  });
});

describe("Make a plan draft", () => {
  const acc = (id: string, name: string, accountType: number, over: Partial<{ currency: string; isArchived: boolean }> = {}) => ({ id, name, accountType, currency: "PHP", isArchived: false, ...over });
  const seed = (over: Partial<Parameters<typeof makePlanDraft>[0]> = {}): Parameters<typeof makePlanDraft>[0] => ({
    profile: { firstName: "Rolf", onboardingPath: "web", payFrequency: "twice", nextPaydayDate: "2026-10-20" },
    accounts: [acc("a1", "BPI", AccountType.bank), acc("a2", "GCash", AccountType.eWallet), acc("a3", "Old", AccountType.cash, { isArchived: true }), acc("a4", "AUD", AccountType.bank, { currency: "AUD" })],
    sources: [
      { kind: "allowance", landsInAccountId: "a2", categoryId: "c1" },
      { kind: "salary", landsInAccountId: "a1", categoryId: "c2" },
    ],
    latestPayMinor: 2_500_000,
    stored: emptyDraft(),
    ...over,
  });

  it("opens plan-only at Priorities, not skipped, seeded from what they have", () => {
    const d = makePlanDraft(seed());
    expect(draftSchema.safeParse(d).success).toBe(true);
    expect(d).toMatchObject({ path: "web", step: "prio", skipped: false, planOnly: true, firstName: "Rolf", landingAccountId: "a1" });
    expect(d.income).toEqual({ kind: "salary", amountMinor: 2_500_000, frequency: "twice", nextPayday: "2026-10-20", paidInOtherCurrency: false });
    expect(d.accounts.map((a) => [a.id, a.isNew])).toEqual([["a1", false], ["a2", false], ["a4", false]]);
    expect(stepsFor(d)).toEqual(["prio", "plan", "homes"]);
  });

  it("keeps the app path, falls back to the first PHP account, and tolerates a missing pay", () => {
    const d = makePlanDraft(seed({ profile: { firstName: null, onboardingPath: "app", payFrequency: null, nextPaydayDate: null }, sources: [], latestPayMinor: null }));
    expect(d.path).toBe("app");
    expect(d.landingAccountId).toBe("a1");
    expect(d.income).toMatchObject({ amountMinor: null, frequency: null, nextPayday: null, kind: "salary" });
    expect(stepsFor(d)).toEqual(["prio", "plan", "homes", "cats"]);
  });

  it("resumes an unfinished Make a plan draft untouched", () => {
    const mid = { ...emptyDraft(), path: "web" as const, planOnly: true, step: "plan" as const, priority: "safety" as const };
    expect(makePlanDraft(seed({ stored: mid }))).toBe(mid);
  });
});
