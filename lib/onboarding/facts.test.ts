import { describe, expect, it } from "vitest";
import { RecurringFrequency } from "@/lib/domain/enums";
import { buildPhoneFacts, phoneBillsFrom, windowStartMs } from "./facts";
import { accounts, at, categories, entries, facts, phone, TODAY, TZ } from "./testkit";

describe("buildPhoneFacts", () => {
  it("is null until something has synced", () => {
    expect(buildPhoneFacts({ accounts: [], categories: [], entries: [], todayIso: TODAY, timeZone: TZ }).facts).toBeNull();
    // An archived account alone doesn't count as synced data.
    expect(buildPhoneFacts({ accounts: [accounts[3]!], categories: [], entries: [], todayIso: TODAY, timeZone: TZ }).facts).toBeNull();
  });

  it("lists active accounts with Dart-ordered type names and counts the 60-day window without transfer legs", () => {
    const f = facts();
    expect(f.accounts.map((a) => [a.id, a.type])).toEqual([
      ["a-gcash", "eWallet"],
      ["a-bdo", "bank"],
      ["a-maya", "savings"],
    ]);
    expect(f.categoryCount).toBe(5);
    expect(f.sinceIso).toBe("2026-08-13");
    // Salary Sep + Oct, stipend, groceries Sep + Oct, movies, misc = 7 real entries since Aug 13; Aug 7 is out; the transfer leg isn't an entry.
    expect(f.entriesSince).toBe(7);
    expect(f.incomeSinceMinor).toBe(2_500_000 * 2 + 700_000);
  });

  it("detects sources per BR 12.4: main pay = most entries, latest entry and landing account kept", () => {
    const f = facts();
    expect(f.mainCategoryId).toBe("c-salary");
    const [salary, stipend] = f.sources;
    expect(salary).toMatchObject({ categoryId: "c-salary", landsInAccountId: "a-bdo", latestEntryId: "sal-oct", latestAccountId: "a-bdo", latestAmountMinor: 2_500_000, cadence: "monthly", kind: "salary", rule: "plan" });
    expect(salary!.recent.map((r) => r.date)).toEqual(["2026-10-07", "2026-09-07", "2026-08-07"]);
    expect(salary!.nextPayday).toBe("2026-11-07");
    expect(stipend).toMatchObject({ categoryId: "c-stipend", kind: "scholarship", rule: "whole", cadence: "once", nextPayday: null });
  });

  it("income this month is what's waiting (BR 12.4.6), newest first", () => {
    expect(facts().waiting.map((w) => [w.entryId, w.amountMinor])).toEqual([
      ["sal-oct", 2_500_000],
      ["dost-oct", 700_000],
    ]);
  });

  it("sums last month's spend per auto-mapped bucket, and per category", () => {
    const p = phone();
    expect(p.facts!.expenseCategories.map((c) => [c.name, c.lastMonthSpendMinor])).toEqual([
      ["Groceries", 500_000],
      ["Misc", 30_000],
      ["Movies", 120_000],
    ]);
    // Groceries and the unmatched Misc land in Living; Movies in Fun. October's groceries aren't last month.
    expect(p.lastMonthSpendMinor).toEqual({ living: 530_000, fun: 120_000 });
  });

  it("skips accounts in a currency the draft can't hold, and entries without an income category", () => {
    const f = buildPhoneFacts({
      accounts: [...accounts, { id: "a-jpy", name: "Yen", accountType: 1, currency: "JPY", isArchived: false }],
      categories,
      entries: [...entries(), { id: "x", accountId: "a-gcash", categoryId: null, amountMinor: 9_900, direction: 0, origin: 0, transferId: null, occurredAt: at("2026-10-10") }],
      todayIso: TODAY,
      timeZone: TZ,
    }).facts!;
    expect(f.accounts.map((a) => a.id)).not.toContain("a-jpy");
    expect(f.sources.map((s) => s.categoryId).sort()).toEqual(["c-salary", "c-stipend"]);
  });
});

describe("windowStartMs", () => {
  it("is local midnight 90 days back", () => {
    expect(windowStartMs("2026-10-12", "Asia/Manila")).toBe(Date.UTC(2026, 6, 13, 16)); // Jul 14 00:00 in UTC+8
  });
});

describe("phoneBillsFrom (mobile recurring_rules outflows)", () => {
  const now = at("2026-10-12");
  const rule = (amountMinor: number, frequency: number, extra: Partial<{ interval: number; startDate: number; endDate: number | null }> = {}) => ({
    amountMinor,
    frequency,
    interval: 1,
    startDate: at("2026-01-01"),
    endDate: null,
    ...extra,
  });

  it("is null when there are no usable rules", () => {
    expect(phoneBillsFrom([], now, TZ)).toBeNull();
    expect(phoneBillsFrom([rule(100, RecurringFrequency.custom)], now, TZ)).toBeNull();
  });

  it("normalises each rule to a monthly amount in integer centavos", () => {
    const r = phoneBillsFrom(
      [
        rule(600_000, RecurringFrequency.monthly),
        rule(120_000, RecurringFrequency.quarterly), // 40,000 a month
        rule(1_200_000, RecurringFrequency.yearly), // 100,000 a month
        rule(10_000, RecurringFrequency.weekly), // 52 * 10,000 / 12 = 43,333.33 -> 43,333
        rule(50_000, RecurringFrequency.monthly, { interval: 2 }), // every other month
      ],
      now,
      TZ,
    );
    expect(r).toEqual({ totalMinor: 600_000 + 40_000 + 100_000 + 43_333 + 25_000, startsOn: null });
  });

  it("ignores ended rules and reports the earliest future start", () => {
    const r = phoneBillsFrom(
      [
        rule(500_000, RecurringFrequency.monthly, { endDate: at("2026-09-01") }),
        rule(200_000, RecurringFrequency.monthly, { startDate: at("2027-02-01") }),
        rule(300_000, RecurringFrequency.monthly, { startDate: at("2027-01-01") }),
      ],
      now,
      TZ,
    );
    expect(r).toEqual({ totalMinor: 500_000, startsOn: "2027-01-01" });
  });
});
