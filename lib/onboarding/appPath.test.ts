import { describe, expect, it } from "vitest";
import {
  chooseCategoryBucket,
  initAccounts,
  initCategories,
  initFirstPay,
  initIncome,
  mapCategories,
  otherIncomeWaiting,
  protectedAccountId,
  setMain,
  setRule,
  toggleAccount,
  validateApp,
  validateAppIncome,
} from "./appPath";
import type { OnboardingDraft } from "./draft";
import { appDraft, ctx, facts, plan, TODAY } from "./testkit";

const merge = (d: OnboardingDraft, p: Partial<OnboardingDraft> | null): OnboardingDraft => (p ? { ...d, ...p } : d);

describe("Your app: accounts in the plan", () => {
  it("first arrival ticks every synced account (isNew false); a second visit changes nothing", () => {
    const d = merge(appDraft(), initAccounts(appDraft(), facts()));
    expect(d.accounts.map((a) => [a.id, a.isNew])).toEqual([
      ["a-gcash", false],
      ["a-bdo", false],
      ["a-maya", false],
    ]);
    expect(initAccounts(d, facts())).toBeNull();
    expect(initAccounts(appDraft(), null)).toBeNull();
  });

  it("the account the main pay lands in can't be unticked; others can, and come back in phone order", () => {
    const f = facts();
    let d = merge(appDraft(), initAccounts(appDraft(), f));
    expect(protectedAccountId(d, f)).toBe("a-bdo");
    expect(toggleAccount(d, f, "a-bdo", false)).toBeNull();
    d = merge(d, toggleAccount(d, f, "a-gcash", false));
    expect(d.accounts.map((a) => a.id)).toEqual(["a-bdo", "a-maya"]);
    d = merge(d, toggleAccount(d, f, "a-gcash", true));
    expect(d.accounts.map((a) => a.id)).toEqual(["a-gcash", "a-bdo", "a-maya"]);
  });

  it("the last remaining account can't be unticked either", () => {
    const f = facts();
    const d = appDraft({ accounts: [{ id: "a-maya", name: "Maya Savings", type: "savings", currency: "PHP", isNew: false }], landingAccountId: "a-maya" });
    expect(toggleAccount(d, f, "a-maya", false)).toBeNull();
  });

  it("validate: waiting for the phone, then needs an account", () => {
    expect(validateApp(appDraft(), null)?.field).toBe("ob-wait");
    expect(validateApp(appDraft(), facts())?.field).toBe("ob-acct-0");
    expect(validateApp(merge(appDraft(), initAccounts(appDraft(), facts())), facts())).toBeNull();
  });
});

describe("Income (app path)", () => {
  const start = () => {
    const f = facts();
    const withAccts = merge(appDraft({ step: "income" }), initAccounts(appDraft(), f));
    return { f, d: merge(withAccts, initIncome(withAccts, f)) };
  };

  it("fills sources, the main pay's amount, rhythm and payday, landing account and the entry First pay splits", () => {
    const { d } = start();
    expect(d.sources.map((s) => [s.key, s.isMain, s.rule, s.wholeBucket, s.kind])).toEqual([
      ["c-salary", true, "plan", null, "salary"],
      ["c-stipend", false, "whole", "scholarship", "scholarship"],
    ]);
    expect(d.sources[0]).toMatchObject({ categoryId: "c-salary", landsInAccountId: "a-bdo", name: "Salary" });
    expect(d.income).toMatchObject({ kind: "salary", amountMinor: 2_500_000, frequency: "monthly", nextPayday: "2026-11-07" });
    expect(d.landingAccountId).toBe("a-bdo");
    expect(d.firstPay).toMatchObject({ entryId: "sal-oct", amountMinor: 2_500_000, date: "2026-10-07" });
    expect(validateAppIncome(d, ctx())).toBeNull();
  });

  it("is idempotent: an existing answer is never overwritten", () => {
    const { f, d } = start();
    expect(initIncome(d, f)).toBeNull();
  });

  it("exactly one main pay: picking another moves the flag, resets rules and follows the new pay", () => {
    const { f, d } = start();
    const d2 = merge(d, setMain(d, f, "c-stipend"));
    expect(d2.sources.filter((s) => s.isMain).map((s) => s.key)).toEqual(["c-stipend"]);
    expect(d2.sources.find((s) => s.key === "c-stipend")).toMatchObject({ rule: "plan", wholeBucket: null });
    // The old main goes back to what its kind suggests.
    expect(d2.sources.find((s) => s.key === "c-salary")).toMatchObject({ isMain: false, rule: "plan" });
    expect(d2.landingAccountId).toBe("a-gcash");
    expect(d2.income).toMatchObject({ kind: "scholarship", amountMinor: 700_000, frequency: "varies", nextPayday: null });
    expect(d2.firstPay.entryId).toBe("dost-oct");
    // No payday guess for a source seen once: the user has to enter it.
    expect(validateAppIncome(d2, ctx())).toMatchObject({ field: "ob-next-payday" });
  });

  it("a main pay landing in an unticked account brings that account back into the plan", () => {
    const { f, d } = start();
    const trimmed = merge(d, toggleAccount(d, f, "a-gcash", false));
    expect(trimmed.accounts.map((a) => a.id)).not.toContain("a-gcash");
    expect(merge(trimmed, setMain(trimmed, f, "c-stipend")).accounts.map((a) => a.id)).toContain("a-gcash");
  });

  it("rules: only non-main sources change; whole picks Scholarship for a scholarship and Living otherwise", () => {
    const { d } = start();
    expect(setRule(d, "c-salary", "ask")).toBeNull();
    const asked = merge(d, setRule(d, "c-stipend", "ask"));
    expect(asked.sources[1]).toMatchObject({ rule: "ask", wholeBucket: null });
    expect(merge(asked, setRule(asked, "c-stipend", "whole")).sources[1]).toMatchObject({ rule: "whole", wholeBucket: "scholarship" });
    const alt = { ...d, sources: d.sources.map((s) => (s.key === "c-stipend" ? { ...s, kind: "allowance" as const, wholeBucket: null } : s)) };
    expect(merge(alt, setRule(alt, "c-stipend", "whole")).sources[1]).toMatchObject({ wholeBucket: "living" });
  });

  it("validate: needs one main, a landing account and a payday that is today or later", () => {
    const { d } = start();
    expect(validateAppIncome(appDraft(), ctx())?.field).toBe("ob-scratch");
    expect(validateAppIncome({ ...d, sources: d.sources.map((s) => ({ ...s, isMain: false })) }, ctx())?.field).toBe("ob-main-0");
    expect(validateAppIncome({ ...d, sources: d.sources.map((s) => ({ ...s, isMain: true })) }, ctx())?.field).toBe("ob-main-0");
    expect(validateAppIncome({ ...d, income: { ...d.income, nextPayday: null } }, ctx())).toMatchObject({ field: "ob-next-payday", message: "Add the date of your next main payday." });
    expect(validateAppIncome({ ...d, income: { ...d.income, nextPayday: "2026-10-11" } }, ctx())).toMatchObject({ field: "ob-next-payday", message: "Pick a payday that's today or later." });
    expect(validateAppIncome({ ...d, income: { ...d.income, nextPayday: TODAY } }, ctx())).toBeNull();
  });
});

describe("Categories (BR 12.5)", () => {
  const withPlan = (p = plan()) => appDraft({ planA: p });

  it("maps with autoMapCategory: sure ones are automatic, unmatched go to Living as not sure", () => {
    expect(mapCategories(withPlan(), facts())).toEqual({
      "c-groc": { bucket: "living", source: "auto", notSure: false },
      "c-misc": { bucket: "living", source: "auto", notSure: true },
      "c-movies": { bucket: "fun", source: "auto", notSure: false },
    });
  });

  it("needs a plan to map against", () => {
    expect(mapCategories(appDraft(), facts())).toBeNull();
    expect(initCategories(appDraft(), facts())).toBeNull();
  });

  it("a hand-picked bucket stays; picking one marks it as the user's and no longer unsure", () => {
    const f = facts();
    let d = merge(withPlan(), initCategories(withPlan(), f));
    d = merge(d, chooseCategoryBucket(d, "c-misc", "sinking"));
    expect(d.categories!["c-misc"]).toEqual({ bucket: "sinking", source: "user", notSure: false });
    // Re-entering the step keeps it, and is a no-op.
    expect(initCategories(d, f)).toBeNull();
  });

  it("turning a bucket off sends its categories back to not sure, user-picked ones included", () => {
    const f = facts();
    let d = merge(withPlan(), initCategories(withPlan(), f));
    d = merge(d, chooseCategoryBucket(d, "c-misc", "sinking"));
    const off = { ...d, planA: plan({ fun: 0, sinking: 0, living: 50 }) };
    const re = merge(off, initCategories(off, f)).categories!;
    expect(re["c-movies"]).toEqual({ bucket: "living", source: "auto", notSure: true });
    expect(re["c-misc"]).toEqual({ bucket: "living", source: "auto", notSure: true });
    expect(re["c-groc"]).toEqual({ bucket: "living", source: "auto", notSure: false });
  });

  it("with Living itself off, the biggest bucket takes the category", () => {
    const d = withPlan(plan({ living: 0, emergency: 65 }));
    expect(mapCategories(d, facts())!["c-groc"]).toEqual({ bucket: "emergency", source: "auto", notSure: true });
  });

  it("just-track plans map everything to Spending as sure", () => {
    const d = appDraft({ skipped: true, planA: plan({ living: 100, rent: 0, fun: 0, emergency: 0, invest: 0, sinking: 0 }) });
    expect(Object.values(mapCategories(d, facts())!).every((c) => c.bucket === "living" && !c.notSure)).toBe(true);
  });
});

describe("First pay (app path)", () => {
  it("points at the latest main-pay entry, and notes other income waiting with what happens to it", () => {
    const f = facts();
    const withAccts = merge(appDraft(), initAccounts(appDraft(), f));
    const d = merge(withAccts, initIncome(withAccts, f));
    expect(initFirstPay(d, f)).toBeNull();
    const stale = { ...d, firstPay: { ...d.firstPay, entryId: "old" } };
    expect(initFirstPay(stale, f)?.firstPay?.entryId).toBe("sal-oct");
    expect(otherIncomeWaiting(d, f)).toEqual([{ name: "DOST Stipend", amountMinor: 700_000, how: "kept whole in Scholarship" }]);
    const asked = merge(d, setRule(d, "c-stipend", "ask"));
    expect(otherIncomeWaiting(asked, f)[0]!.how).toBe("you'll pick its job");
  });
});
