import { describe, expect, it } from "vitest";
import { emptyDraft } from "./draft";
import type { OnboardingDraft } from "./draft";
import type { StepContext } from "./step";
import { computeHomes, homesOnEnter, paydayPreview, setHome, transfersEachPayday } from "./homes-step";
import { perPay, planOnEnter, planRefresh, realityChecks, setPercent, switchPreset, totalStatus, validatePlan } from "./plan-step";
import { pickPriorityPatch, prioritiesOnEnter, skipPatch, validatePriorities } from "./priorities";

const ctx: StepContext = { path: "web", todayIso: "2026-10-12", homeCurrency: "PHP", lastMonthSpendMinor: null, phoneBills: null };
const merge = (d: OnboardingDraft, p: Partial<OnboardingDraft> | null): OnboardingDraft => ({ ...d, ...(p ?? {}) });
const enter = (d: OnboardingDraft): OnboardingDraft => merge(d, planOnEnter(d));

const acct = (id: string, name: string, type: OnboardingDraft["accounts"][number]["type"]) => ({ id, name, type, currency: "PHP" as const, isNew: true });

function base(over: Partial<OnboardingDraft> = {}): OnboardingDraft {
  const d = emptyDraft();
  return {
    ...d,
    path: "web",
    income: { kind: "salary", amountMinor: 2_500_000, frequency: "twice", nextPayday: "2026-10-21", paidInOtherCurrency: false },
    priority: "safety",
    billsMinor: 600_000,
    billKinds: ["rent"],
    ...over,
  };
}

const O1_ACCOUNTS = [acct("gcash", "GCash", "eWallet"), acct("bpi", "BPI", "bank"), acct("maya", "Maya", "eWallet"), acct("tonik", "Tonik", "savings"), acct("mp2", "Pag-IBIG MP2", "investment")];
// BR §12.3 pick order: Tonik is the only savings account, so it is Emergency's home; Sinking falls back to the same one.

describe("plan step onEnter: BR §12.8", () => {
  it("O1 safety net, bills now", () => {
    const d = enter(base());
    expect(d.planA).toEqual({ living: 38, rent: 12, fun: 10, emergency: 25, invest: 5, sinking: 10, tax: 0, buffer: 0 });
    expect(d.targetMinor).toBe(7_500_000);
    expect(d.planBOn).toBe(true);
    expect(d.planEdited).toBe(false);
    const pay = perPay(d, ctx, d.planA!);
    expect([pay.living, pay.rent, pay.fun, pay.emergency, pay.invest, pay.sinking]).toEqual([950_000, 300_000, 250_000, 625_000, 125_000, 250_000]);
  });

  it("O2 AUD pay, bills start Jan 1 2027: rent redirects before the start", () => {
    const d = enter(
      base({
        income: { kind: "salary", amountMinor: 1_732_900, frequency: "biweekly", nextPayday: "2026-10-21", paidInOtherCurrency: true },
        billsMinor: 200_000,
        billsStart: "2027-01-01",
      }),
    );
    expect(d.planA).toEqual({ living: 44, rent: 6, fun: 5, emergency: 25, invest: 5, sinking: 6, tax: 6, buffer: 3 });
    expect(d.targetMinor).toBe(5_700_000);
    const pay = perPay(d, ctx, d.planA!);
    expect(pay).toEqual({ living: 762_476, rent: 0, fun: 86_645, emergency: 537_199, invest: 86_645, sinking: 103_974, tax: 103_974, buffer: 51_987 });
  });

  it("O3 bills are capped at 45% and the bills warning shows", () => {
    const d = enter(base({ income: { kind: "salary", amountMinor: 3_000_000, frequency: "monthly", nextPayday: null, paidInOtherCurrency: false }, priority: "control", billsMinor: 2_000_000 }));
    expect(d.planA).toMatchObject({ rent: 45, living: 10, fun: 15, emergency: 15, invest: 5, sinking: 10 });
    const w = realityChecks(d, ctx, d.planA!);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ short: true, lead: "Short" });
    expect(w[0]?.text).toContain("₱20,000");
    expect(w[0]?.text).toContain("₱13,500");
  });

  it("O4 side hustle that varies, saving for something: Plan B offered", () => {
    const d = enter(base({ income: { kind: "side_hustle", amountMinor: 1_500_000, frequency: "varies", nextPayday: null, paidInOtherCurrency: false }, priority: "goal", goal: { name: "Laptop", costMinor: 5_000_000 }, billsMinor: 0, billKinds: [] }));
    expect(d.planA).toEqual({ living: 50, rent: 0, fun: 5, emergency: 10, invest: 5, sinking: 19, tax: 6, buffer: 5 });
    expect(d.planBOn).toBe(true);
  });

  it("O5 skip sets Spending 100, no Plan B, no transfers", () => {
    const d0 = base({ accounts: O1_ACCOUNTS, landingAccountId: "bpi" });
    const d = merge(d0, skipPatch(d0));
    expect(d.skipped).toBe(true);
    expect(d.planA).toMatchObject({ living: 100, emergency: 0 });
    expect(d.planBOn).toBe(false);
    expect(new Set(Object.values(d.homes ?? {}))).toEqual(new Set(["bpi"]));
    expect(planOnEnter(d)).toBeNull();
    expect(validatePlan(d)).toBeNull();
    expect(validatePriorities(d, ctx)).toBeNull();
    const pv = paydayPreview(d, ctx);
    expect(pv.sends).toEqual([]);
    expect(pv.text).toMatch(/everything stays where it lands/);
    expect(pv.keepNames).toEqual(["Spending"]);
  });

  it("O6 homes give 4 transfers", () => {
    const d = merge(enter(base({ accounts: O1_ACCOUNTS, landingAccountId: "bpi" })), null);
    const h = merge(d, homesOnEnter(d));
    expect(h.homes).toMatchObject({ living: "gcash", fun: "maya", rent: "bpi", emergency: "tonik", sinking: "tonik", invest: "mp2" });
    expect(transfersEachPayday(h)).toBe(4);
    const pv = paydayPreview(h, ctx);
    expect(pv.transfers).toBe(4);
    expect(pv.text).toBe("4 transfers each payday. Fewer homes means fewer transfers.");
    expect(pv.keepMinor).toBe(300_000);
    expect(pv.sends.map((s) => s.toName).sort()).toEqual(["GCash", "Maya", "Pag-IBIG MP2", "Tonik"]);
    expect(pv.sends.reduce((t, s) => t + s.amountMinor, pv.keepMinor)).toBe(2_500_000);
  });
});

describe("plan step behaviour", () => {
  it("does nothing on re-entry when nothing changed", () => {
    const d = enter(base());
    expect(planRefresh(d)).toBeNull();
    expect(planOnEnter(d)).toBeNull();
  });

  it("edits survive re-entry when the inputs are the same", () => {
    let d = enter(base());
    d = merge(d, setPercent(d, "fun", 15));
    expect(d.planEdited).toBe(true);
    expect(planOnEnter(d)).toBeNull();
    expect(d.planA?.fun).toBe(15);
  });

  it("changed inputs without edits re-suggest silently; with edits they replace and announce", () => {
    let d = enter(base());
    const changed = { ...d, priority: "grow" as const };
    expect(planRefresh(changed)?.announce).toBeNull();
    expect(planOnEnter(changed)?.planA).toMatchObject({ invest: 25 });
    d = merge(d, setPercent(d, "fun", 15));
    const edited = { ...d, priority: "grow" as const };
    const r = planRefresh(edited);
    expect(r?.announce).toBe("Your answers changed, so the plan was suggested again.");
    expect(r?.patch.planA).toMatchObject({ invest: 25 });
    expect(r?.patch.planEdited).toBe(false);
    // onEnter leaves the announced case to Body
    expect(planOnEnter(edited)).toBeNull();
  });

  it("switching preset replaces edits and says so", () => {
    let d = enter(base());
    const silent = switchPreset(d, "simple");
    expect(silent.announce).toBe("Switched to Simple.");
    d = merge(d, setPercent(d, "fun", 15));
    const s = switchPreset(d, "fifty_thirty_twenty");
    expect(s.announce).toBe("Switched to 50/30/20. Your edits were replaced.");
    const after = merge(d, s.patch);
    expect(after.preset).toBe("fifty_thirty_twenty");
    expect(after.planEdited).toBe(false);
    expect(after.planA).toMatchObject({ fun: 30, emergency: 10, invest: 5, sinking: 5 });
    expect(planRefresh(after)).toBeNull();
  });

  it("percent edits clamp to whole 0-100, follow the target, and gate Plan B", () => {
    let d = enter(base());
    d = merge(d, setPercent(d, "living", 200));
    expect(d.planA?.living).toBe(100);
    d = merge(d, setPercent(d, "living", -5));
    expect(d.planA?.living).toBe(0);
    expect(d.targetMinor).toBe(1_800_000); // 3 x 12% of the 50,000 a month
  });

  it("validate needs exactly 100", () => {
    let d = enter(base());
    expect(validatePlan(d)).toBeNull();
    d = merge(d, setPercent(d, "fun", 5));
    const e = validatePlan(d);
    expect(e?.field).toBe("plan-total");
    expect(e?.message).toMatch(/95%/);
    expect(totalStatus(d.planA!).text).toBe("95% · 5% still needs a job");
    expect(totalStatus(enter(base()).planA!).text).toMatch(/^100%/);
  });

  it("validate asks for a target of at least ₱1,000 while Plan B is on", () => {
    const d = enter(base());
    expect(validatePlan({ ...d, targetMinor: 50_000 })?.field).toBe("plan-target");
    expect(validatePlan({ ...d, targetMinor: 50_000, planBOn: false })).toBeNull();
  });

  it("Plan B is switched off when Emergency drops under 10%", () => {
    let d = enter(base());
    d = merge(d, setPercent(d, "emergency", 5));
    expect(d.planBOn).toBe(false);
    d = merge(d, setPercent(d, "emergency", 12));
    expect(d.planBOn).toBe(true);
  });

  it("app path reality checks compare Living and Fun with last month", () => {
    const d = enter(base());
    const c: StepContext = { ...ctx, path: "app", lastMonthSpendMinor: { living: 2_500_000, fun: 100_000 } };
    const r = realityChecks(d, c, d.planA!);
    expect(r.map((x) => [x.bucket, x.short])).toEqual([["living", true], ["fun", false]]);
  });
});

describe("priorities", () => {
  it("validates priority, goal and the later start date", () => {
    expect(validatePriorities(base({ priority: null }), ctx)?.field).toBe("prio-safety");
    expect(validatePriorities(base({ priority: "goal", goal: null }), ctx)?.field).toBe("prio-goal-name");
    expect(validatePriorities(base({ priority: "goal", goal: { name: "Laptop", costMinor: 0 } }), ctx)?.field).toBe("prio-goal-cost");
    expect(validatePriorities(base({ priority: "goal", goal: { name: "Laptop", costMinor: 100 } }), ctx)).toBeNull();
    expect(validatePriorities(base({ billsStart: "2026-10-12" }), ctx)?.field).toBe("prio-bills-start");
    expect(validatePriorities(base({ billsStart: "2027-01-01" }), ctx)).toBeNull();
    expect(validatePriorities(base({ billsMinor: 0, billsStart: null }), ctx)).toBeNull();
  });

  it("app path prefills bills from the phone once", () => {
    const c: StepContext = { ...ctx, path: "app", phoneBills: { totalMinor: 200_000, startsOn: "2027-01-01" } };
    const d = base({ billsMinor: 0, billKinds: [] });
    expect(prioritiesOnEnter(d, c)).toEqual({ billsMinor: 200_000, billsStart: "2027-01-01" });
    expect(prioritiesOnEnter(base(), c)).toBeNull();
    expect(prioritiesOnEnter(d, ctx)).toBeNull();
  });

  it("picking a priority again undoes the skip", () => {
    const d0 = base({ accounts: O1_ACCOUNTS, landingAccountId: "bpi" });
    const skipped = merge(d0, skipPatch(d0));
    const back = merge(skipped, pickPriorityPatch(skipped, "grow"));
    expect(back.skipped).toBe(false);
    expect(back.planA).toBeNull();
    expect(planOnEnter(back)?.planA).toMatchObject({ invest: 25 });
  });
});

describe("homes", () => {
  const withHomes = () => {
    const d = enter(base({ accounts: O1_ACCOUNTS, landingAccountId: "bpi" }));
    return merge(d, homesOnEnter(d));
  };

  it("keeps a hand-picked home across re-entry while the account exists", () => {
    let d = withHomes();
    d = merge(d, setHome(d, "fun", "gcash"));
    expect(d.homesUserSet).toEqual(["fun"]);
    expect(homesOnEnter(d)).toBeNull();
    expect(computeHomes(d).fun).toBe("gcash");
  });

  it("re-suggests the rest when accounts change and drops a choice whose account is gone", () => {
    let d = withHomes();
    d = merge(d, setHome(d, "fun", "gcash"));
    d = merge(d, setHome(d, "invest", "mp2"));
    const fewer = { ...d, accounts: d.accounts.filter((a) => a.id !== "mp2" && a.id !== "tonik") };
    const out = merge(fewer, homesOnEnter(fewer));
    expect(out.homesUserSet).toEqual(["fun"]);
    expect(out.homes?.fun).toBe("gcash");
    expect(out.homes?.emergency).toBe("bpi");
    expect(out.homes?.invest).toBe("bpi");
  });

  it("adds Scholarship when a scholarship source exists", () => {
    const d = withHomes();
    const s = { ...d, sources: [{ key: "s", name: "DOST", kind: "scholarship" as const, rule: "whole" as const, wholeBucket: "scholarship" as const, ownSplit: null, landsInAccountId: "bpi", categoryId: null, isMain: false }] };
    expect(computeHomes(s).scholarship).toBe("bpi");
  });

  it("ignores non-PHP accounts", () => {
    const d = base({ accounts: [...O1_ACCOUNTS, { ...acct("aud", "Wise", "bank"), currency: "AUD" as const }], landingAccountId: "bpi" });
    const e = enter(d);
    expect(Object.values(computeHomes(e))).not.toContain("aud");
  });
});
