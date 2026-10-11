import { describe, expect, it } from "vitest";
import { emptyDraft } from "./draft";
import { slipDate } from "./labels";
import { buildSlip } from "./slip";
import { appDraft, plan, TODAY } from "./testkit";

const acct = (id: string, name: string) => ({ id, name, type: "bank" as const, currency: "PHP" as const, isNew: false });
const c = { todayIso: TODAY };

describe("slipDate", () => {
  it("prints weekday, month, day and year", () => {
    expect(slipDate("2026-10-12")).toBe("Mon Oct 12 2026");
    expect(slipDate("2026-10-11")).toBe("Sun Oct 11 2026");
  });
});

describe("plan slip model", () => {
  it("a fresh draft is all · · · (null values) with no split", () => {
    const m = buildSlip(emptyDraft(), c);
    expect(m.rows.map((r) => r.value)).toEqual([null, null, null, null, null, null, null]);
    expect(m.split).toBeNull();
    expect(m.payday).toBeNull();
    expect(m.dateLine).toBe("Mon Oct 12 2026");
  });

  it("prints a line per answer, in the SPEC order", () => {
    const d = appDraft({
      firstName: "Maria",
      income: { kind: "salary", amountMinor: 2_500_000, frequency: "twice", nextPayday: "2026-10-21", paidInOtherCurrency: false },
      accounts: [acct("a1", "GCash"), acct("a2", "BDO")],
      landingAccountId: "a2",
      priority: "safety",
    });
    expect(buildSlip(d, c).rows).toEqual([
      { key: "for", label: "For", value: "Maria" },
      { key: "in", label: "Comes in", value: "₱25,000.00" },
      { key: "freq", label: "How often", value: "Twice a month" },
      { key: "next", label: "Next payday", value: "Oct 21" },
      { key: "accts", label: "Accounts", value: "2" },
      { key: "lands", label: "Lands in", value: "BDO" },
      { key: "first", label: "First", value: "Safety net first" },
    ]);
  });

  it("the split uses the engine: whole percents and centavos that add up exactly (BR O1)", () => {
    const d = appDraft({
      income: { kind: "salary", amountMinor: 2_500_000, frequency: "twice", nextPayday: null, paidInOtherCurrency: false },
      planA: plan({ living: 38, rent: 12, fun: 10, emergency: 25, invest: 5, sinking: 10 }),
    });
    const s = buildSlip(d, c).split!;
    expect(s.lines.map((l) => [l.bucket, l.pct, l.amountText])).toEqual([
      ["living", 38, "₱9,500.00"],
      ["rent", 12, "₱3,000.00"],
      ["fun", 10, "₱2,500.00"],
      ["emergency", 25, "₱6,250.00"],
      ["invest", 5, "₱1,250.00"],
      ["sinking", 10, "₱2,500.00"],
    ]);
    expect(s.totalPct).toBe(100);
  });

  it("while the plan doesn't total 100 the shares still print, with the honest total", () => {
    const d = appDraft({ income: { kind: "salary", amountMinor: 1_000_000, frequency: "monthly", nextPayday: null, paidInOtherCurrency: false }, planA: plan({ living: 30 }) });
    const s = buildSlip(d, c).split!;
    expect(s.totalPct).toBe(90);
    expect(s.lines.find((l) => l.bucket === "living")!.amountText).toBe("₱3,000.00");
  });

  it("no amount yet: percents print, pesos wait", () => {
    const s = buildSlip(appDraft({ planA: plan() }), c).split!;
    expect(s.lines[0]!.amountText).toBe("· · ·");
  });

  it("On payday counts the distinct homes other than where pay lands, once Where it lives has run", () => {
    const base = appDraft({ landingAccountId: "a1", accounts: [acct("a1", "GCash"), acct("a2", "BDO"), acct("a3", "Maya")], planA: plan() });
    expect(buildSlip(base, c).payday).toBeNull();
    const homes = buildSlip({ ...base, homes: { living: "a1", emergency: "a2", invest: "a3", sinking: "a3" } }, c);
    expect(homes.payday).toBe("2 transfers");
    expect(buildSlip({ ...base, homes: { emergency: "a2" } }, c).payday).toBe("1 transfer");
    expect(buildSlip({ ...base, homes: {} }, c).payday).toBe("no transfers");
  });

  it("just tracking: First says so, the split is Spending 100%, no transfers", () => {
    const d = appDraft({ skipped: true, landingAccountId: "a1", accounts: [acct("a1", "GCash")], income: { kind: "salary", amountMinor: 100_000, frequency: "monthly", nextPayday: null, paidInOtherCurrency: false } });
    const m = buildSlip(d, c);
    expect(m.rows.find((r) => r.key === "first")!.value).toBe("Just tracking");
    expect(m.split!.lines).toEqual([{ bucket: "living", label: "Spending", pct: 100, amountText: "₱1,000.00" }]);
    expect(m.payday).toBe("no transfers");
  });

  it("bills starting later are noted under the slip, and the Bills line takes the one bill kind's name", () => {
    const d = appDraft({ planA: plan(), billKinds: ["tuition"], billsStart: "2027-01-01" });
    const m = buildSlip(d, c);
    expect(m.billsNote).toBe("Tuition's share goes to Emergency until Jan 1.");
    expect(m.split!.lines.find((l) => l.bucket === "rent")!.label).toBe("Tuition");
  });
});
