import { describe, expect, it } from "vitest";
import { formatPeso } from "./format";
import { PLAN_BUCKETS, autoMapCategory, detectCadence, detectIncomeSources, guessKind, justTrackPlan, monthlyIncome, planBFrom, planToLines, safetyNetTarget, suggestHomes, suggestPlan, transferCount } from "./suggest";
import type { HomeAccount, PhoneInflow, PlanPercents } from "./suggest";
import { splitByPlan } from "./split";
import { toMap } from "./testkit";

const pct = (o: Partial<PlanPercents>): PlanPercents => ({ living: 0, rent: 0, fun: 0, emergency: 0, invest: 0, sinking: 0, tax: 0, buffer: 0, ...o });
const SPLIT_BUCKETS = [...PLAN_BUCKETS];
const splitOf = (amount: number, plan: PlanPercents, onDate: string, billsLater = false) =>
  toMap(splitByPlan(amount, planToLines(plan), { onDate, buckets: SPLIT_BUCKETS, emergencyBucketId: "emergency", rentRedirect: billsLater ? { rentBucketId: "rent", startDate: "2027-01-01" } : null }));

describe("O1: salary ₱25,000 twice a month, PHP, safety net, bills ₱6,000 now (Rent)", () => {
  const s = suggestPlan({ amountMinor: 2500000, frequency: "twice", billsMinor: 600000, priority: "safety", kind: "salary", paidInOtherCurrency: false });
  it("plan shares", () => {
    expect(s.plan).toEqual(pct({ living: 38, rent: 12, fun: 10, emergency: 25, invest: 5, sinking: 10 }));
    expect(s.monthlyMinor).toBe(5000000);
  });
  it("split of 2500000", () => {
    const r = splitOf(2500000, s.plan, "2026-10-07");
    expect([r.living, r.rent, r.fun, r.emergency, r.invest, r.sinking]).toEqual([950000, 300000, 250000, 625000, 125000, 250000]);
  });
  it("target ₱75,000", () => {
    const t = safetyNetTarget(s.monthlyMinor, s.plan.living, s.plan.rent);
    expect(t).toBe(7500000);
    expect(formatPeso(t)).toBe("₱75,000.00");
  });
  it("Plan B: Emergency 5, Investments 25", () => {
    expect(s.planB).toMatchObject({ emergency: 5, invest: 25 });
    expect(s.planB && Object.values(s.planB).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("O2: salary ₱17,329 every 2 weeks, paid in AUD, safety net, bills ₱2,000 starting Jan 1 2027", () => {
  const s = suggestPlan({ amountMinor: 1732900, frequency: "biweekly", billsMinor: 200000, priority: "safety", kind: "salary", paidInOtherCurrency: true });
  it("plan shares", () => {
    expect(s.plan).toEqual(pct({ living: 44, rent: 6, fun: 5, emergency: 25, invest: 5, sinking: 6, tax: 6, buffer: 3 }));
  });
  it("split of 1732900 before 2027 (rent redirected to Emergency)", () => {
    const r = splitOf(1732900, s.plan, "2026-10-07", true);
    expect(r).toMatchObject({ living: 762476, rent: 0, fun: 86645, emergency: 537199, invest: 86645, sinking: 103974, tax: 103974, buffer: 51987 });
  });
  it("target ₱57,000", () => {
    expect(safetyNetTarget(s.monthlyMinor, s.plan.living, s.plan.rent)).toBe(5700000);
  });
});

describe("O3: ₱30,000 monthly, keep spending in check, bills ₱20,000", () => {
  const s = suggestPlan({ amountMinor: 3000000, frequency: "monthly", billsMinor: 2000000, priority: "control", kind: "salary", paidInOtherCurrency: false });
  it("Rent 45 (capped), Living 10, Fun 15, Emergency 15, Investments 5, Sinking 10", () => {
    expect(s.plan).toEqual(pct({ rent: 45, living: 10, fun: 15, emergency: 15, invest: 5, sinking: 10 }));
    expect(s.billsCapped).toBe(true);
  });
  it("bills warning shown (₱13,500 < ₱20,000)", () => {
    expect(s.billsWarning).toEqual({ coveredMinor: 1350000, billsMinor: 2000000 });
    expect(formatPeso(s.billsWarning?.coveredMinor ?? 0)).toBe("₱13,500.00");
  });
});

describe("O4: side hustle ₱15,000, it varies, save for something", () => {
  const s = suggestPlan({ amountMinor: 1500000, frequency: "varies", billsMinor: 0, priority: "goal", kind: "side_hustle", paidInOtherCurrency: false });
  it("plan shares", () => {
    expect(s.plan).toEqual(pct({ living: 50, fun: 5, emergency: 10, invest: 5, sinking: 19, tax: 6, buffer: 5 }));
  });
  it("Plan B offered (Emergency 5, Investments 10)", () => {
    expect(s.planB).toMatchObject({ emergency: 5, invest: 10 });
  });
});

describe("O5: Skip (just track)", () => {
  const j = justTrackPlan("acct-L");
  it("Spending 100; no Plan B, no goals, every bucket kept in L", () => {
    expect(j.plan).toEqual(pct({ living: 100 }));
    expect(j.planB).toBeNull();
    expect(j.goals).toEqual([]);
    expect(Object.values(j.homes).every((h) => h === "acct-L")).toBe(true);
  });
  it("no transfers", () => expect(transferCount(j.homes, j.plan, "acct-L")).toBe(0));
  it("all categories map to Spending, automatic", () => {
    expect(autoMapCategory("Anything at all", j.plan, { justTrack: true })).toEqual({ bucket: "living", sure: true });
    expect(j.categoryMapSource).toBe("auto");
  });
});

describe("O6: O1 accounts GCash, BPI (landing), Maya, Tonik, Pag-IBIG MP2", () => {
  const accounts: HomeAccount[] = [
    { id: "gcash", kind: "eWallet" },
    { id: "bpi", kind: "bank" },
    { id: "maya", kind: "eWallet" },
    { id: "tonik", kind: "savings" },
    { id: "pagibig", kind: "investment" },
  ];
  const homes = suggestHomes(accounts, "bpi");
  const plan = suggestPlan({ amountMinor: 2500000, frequency: "twice", billsMinor: 600000, priority: "safety", kind: "salary", paidInOtherCurrency: false }).plan;
  it("Living GCash · Fun Maya · Rent BPI · Emergency Tonik · Sinking Tonik · Investments Pag-IBIG MP2", () => {
    expect(homes).toMatchObject({ living: "gcash", fun: "maya", rent: "bpi", emergency: "tonik", sinking: "tonik", invest: "pagibig" });
  });
  it("4 transfers", () => expect(transferCount(homes, plan, "bpi")).toBe(4));
});

describe("suggestHomes fallbacks (§12.3)", () => {
  it("only the landing account: everything stays", () => {
    const h = suggestHomes([{ id: "L", kind: "bank" }], "L");
    expect(Object.values(h).every((x) => x === "L")).toBe(true);
  });
  it("one e-wallet: Fun shares it; no e-wallet falls back to cash then L", () => {
    expect(suggestHomes([{ id: "L", kind: "bank" }, { id: "w", kind: "eWallet" }], "L")).toMatchObject({ living: "w", fun: "w" });
    expect(suggestHomes([{ id: "L", kind: "bank" }, { id: "c", kind: "cash" }], "L")).toMatchObject({ living: "c", fun: "c" });
  });
  it("Emergency: savings not L, else another bank, else L; Sinking: second savings", () => {
    expect(suggestHomes([{ id: "L", kind: "bank" }, { id: "b2", kind: "bank" }], "L")).toMatchObject({ emergency: "b2", sinking: "b2", invest: "b2" });
    expect(suggestHomes([{ id: "L", kind: "bank" }, { id: "s1", kind: "savings" }, { id: "s2", kind: "savings" }], "L")).toMatchObject({ emergency: "s1", sinking: "s2", invest: "s1" });
    expect(suggestHomes([{ id: "L", kind: "savings" }, { id: "s1", kind: "savings" }], "L").emergency).toBe("s1");
  });
  it("ignores non-PHP accounts", () => {
    expect(suggestHomes([{ id: "L", kind: "bank" }, { id: "aud", kind: "savings", currency: "AUD" }], "L").emergency).toBe("L");
  });
});

describe("suggestPlan: rules and edge cases (§12.1)", () => {
  const input = { amountMinor: 2500000, frequency: "monthly" as const, billsMinor: 0, priority: "safety" as const, kind: "salary" as const, paidInOtherCurrency: false };
  it("always totals exactly 100", () => {
    for (const priority of ["safety", "goal", "grow", "control"] as const)
      for (const frequency of ["monthly", "twice", "biweekly", "weekly", "varies"] as const)
        for (const billsMinor of [0, 100000, 600000, 2000000, 99999999])
          for (const preset of ["suggested", "fifty_thirty_twenty", "simple"] as const)
            for (const [kind, paidInOtherCurrency] of [["salary", false], ["side_hustle", true], ["allowance", false]] as const) {
              const s = suggestPlan({ ...input, priority, frequency, billsMinor, preset, kind, paidInOtherCurrency });
              expect(Object.values(s.plan).reduce((a, b) => a + b, 0)).toBe(100);
              expect(Object.values(s.plan).every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
            }
  });
  it("under 100 adds the gap to Emergency (simple preset, no set-asides: 20+20+... )", () => {
    const s = suggestPlan({ ...input, preset: "simple" });
    // living 60 + fun 20 + emergency 20 = 100
    expect(s.plan).toEqual(pct({ living: 60, fun: 20, emergency: 20 }));
  });
  it("50/30/20 preset", () => {
    expect(suggestPlan({ ...input, preset: "fifty_thirty_twenty" }).plan).toEqual(pct({ living: 50, fun: 30, emergency: 10, invest: 5, sinking: 5 }));
  });
  it("monthly income uses exact fractions, half up", () => {
    expect(monthlyIncome(1732900, "biweekly")).toBe(3754617);
    expect(monthlyIncome(100, "weekly")).toBe(433); // 433.33
    expect(monthlyIncome(2500000, "twice")).toBe(5000000);
  });
  it("bills ceil: ₱6,000 of ₱50,000 is exactly 12; one centavo more is 13", () => {
    expect(suggestPlan({ ...input, amountMinor: 5000000, billsMinor: 600000 }).billsPct).toBe(12);
    expect(suggestPlan({ ...input, amountMinor: 5000000, billsMinor: 600001 }).billsPct).toBe(13);
  });
  it("bills within the cap have no warning", () => {
    expect(suggestPlan({ ...input, billsMinor: 600000 }).billsWarning).toBeNull();
  });
  it("Plan B is not offered when Emergency < 10", () => {
    expect(planBFrom(pct({ living: 90, emergency: 9, invest: 1 }))).toBeNull();
    expect(planBFrom(pct({ living: 90, emergency: 10 }))).toMatchObject({ emergency: 5, invest: 5 });
  });
  it("zero income does not divide by zero", () => {
    expect(suggestPlan({ ...input, amountMinor: 0, billsMinor: 1000 }).billsPct).toBe(0);
  });
});

describe("safetyNetTarget (§12.2)", () => {
  it("rounds up to ₱1,000, minimum ₱1,000", () => {
    expect(safetyNetTarget(100000, 10, 0)).toBe(100000);
    expect(safetyNetTarget(0, 0, 0)).toBe(100000);
    expect(safetyNetTarget(5000000, 50, 0)).toBe(7500000);
    expect(safetyNetTarget(5000001, 50, 0)).toBe(7600000);
  });
});

describe("detectCadence (§12.4.2)", () => {
  it("one entry: once", () => expect(detectCadence(["2026-10-01"]).cadence).toBe("once"));
  it("weekly 6-8", () => {
    expect(detectCadence(["2026-09-17", "2026-09-24", "2026-10-01"]).cadence).toBe("weekly");
    expect(detectCadence(["2026-09-17", "2026-09-23"]).cadence).toBe("weekly");
    expect(detectCadence(["2026-09-17", "2026-09-26"]).cadence).toBe("varies");
  });
  it("every 2 weeks: dates drift in day-of-month", () => {
    expect(detectCadence(["2026-08-28", "2026-09-11", "2026-09-25"]).cadence).toBe("biweekly");
  });
  it("twice a month: entries near the same two days of month", () => {
    expect(detectCadence(["2026-08-15", "2026-08-30", "2026-09-15"]).cadence).toBe("twice_monthly");
    expect(detectCadence(["2026-08-30", "2026-09-15", "2026-09-30"]).cadence).toBe("twice_monthly");
  });
  it("monthly 28-31", () => {
    expect(detectCadence(["2026-07-31", "2026-08-31", "2026-09-30"]).cadence).toBe("monthly");
    expect(detectCadence(["2026-09-01", "2026-09-29"]).cadence).toBe("monthly");
  });
  it("else varies; only the last three entries count", () => {
    expect(detectCadence(["2026-01-01", "2026-08-01", "2026-09-30"]).cadence).toBe("varies");
    expect(detectCadence(["2026-01-01", "2026-08-15", "2026-08-22", "2026-08-29"]).cadence).toBe("weekly");
  });
});

describe("detectIncomeSources (§12.4)", () => {
  const e = (id: string, cat: string, name: string, acct: string, amt: number, date: string, isTransfer = false): PhoneInflow => ({ id, categoryId: cat, categoryName: name, accountId: acct, amountMinor: amt, occurredOn: date, isTransfer });
  const today = "2026-10-11";
  const entries: PhoneInflow[] = [
    e("1", "sal", "Salary", "mari", 1732900, "2026-09-09"),
    e("2", "sal", "Salary", "mari", 1732900, "2026-09-23"),
    e("3", "sal", "Salary", "gcash", 1732900, "2026-10-07"),
    e("4", "allow", "Allowance", "gcash", 150000, "2026-08-20"),
    e("5", "stip", "DOST stipend", "mari", 700000, "2026-06-01"), // older than 90 days
    e("6", "sal", "Salary", "mari", 999, "2026-10-08", true), // transfer, ignored
  ];
  const r = detectIncomeSources(entries, today);
  const sal = r.sources.find((s) => s.categoryId === "sal");
  it("groups by category, last 90 days only, skips transfers", () => {
    expect(r.sources.map((s) => s.categoryId).sort()).toEqual(["allow", "sal"]);
    expect(sal?.entryCount).toBe(3);
  });
  it("lands in the account most entries landed in", () => expect(sal?.landsInAccountId).toBe("mari"));
  it("cadence, latest amount and next payday (latest + median gap, today or later)", () => {
    expect(sal?.cadence).toBe("biweekly");
    expect(sal?.latestAmountMinor).toBe(1732900);
    expect(sal?.nextPayday).toBe("2026-10-21");
  });
  it("next payday moves forward by whole gaps when stale", () => {
    const r2 = detectIncomeSources(entries, "2026-11-10");
    expect(r2.sources.find((s) => s.categoryId === "sal")?.nextPayday).toBe("2026-11-18");
  });
  it("single entry: once, no next payday", () => {
    const a = r.sources.find((s) => s.categoryId === "allow");
    expect(a?.cadence).toBe("once");
    expect(a?.nextPayday).toBeNull();
  });
  it("main pay: most entries in 60 days, ties by larger total", () => {
    expect(r.mainCategoryId).toBe("sal");
    const tie = detectIncomeSources([e("a", "x", "X", "m", 100, "2026-10-01"), e("b", "y", "Y", "m", 900, "2026-10-02")], today);
    expect(tie.mainCategoryId).toBe("y");
  });
  it("kind and rule from the category name", () => {
    expect(sal).toMatchObject({ kind: "salary", rule: "plan" });
    expect(guessKind("DOST stipend")).toEqual({ kind: "scholarship", rule: "whole" });
    expect(guessKind("Allowance")).toEqual({ kind: "allowance", rule: "whole" });
    expect(guessKind("Freelance")).toEqual({ kind: "other", rule: "ask" });
  });
  it("no entries", () => expect(detectIncomeSources([], today)).toEqual({ sources: [], mainCategoryId: null }));
});

describe("autoMapCategory (§12.5)", () => {
  const plan = pct({ living: 40, rent: 10, fun: 10, emergency: 20, invest: 5, sinking: 10, tax: 3, buffer: 2 });
  it.each([
    ["Groceries", "living"],
    ["Load & data", "living"],
    ["Rent", "rent"],
    ["Internet", "rent"],
    ["Movies & going out", "fun"],
    ["Online shopping", "fun"],
    ["School", "sinking"],
    ["Gifts", "sinking"],
    ["BIR tax payment", "tax"],
    ["Transfer fees & FX", "buffer"],
    ["GROCERIES", "living"],
  ])("%s -> %s (sure)", (name, bucket) => {
    expect(autoMapCategory(name, plan)).toEqual({ bucket, sure: true });
  });
  it("no match -> Living, not sure", () => {
    expect(autoMapCategory("Pet supplies", plan)).toEqual({ bucket: "living", sure: false });
  });
  it("matched bucket without a plan share -> Living, not sure", () => {
    expect(autoMapCategory("Rent", { ...plan, rent: 0 })).toEqual({ bucket: "living", sure: false });
  });
  it("rule order: first match wins", () => {
    expect(autoMapCategory("Water bill", plan).bucket).toBe("living"); // 'water' (Living) before anything later
    expect(autoMapCategory("Rent and utilities", plan).bucket).toBe("living"); // 'utilit' is in Living, listed first
  });
});
