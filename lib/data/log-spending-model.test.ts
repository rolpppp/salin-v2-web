import { describe, expect, it } from "vitest";
import {
  computeImpact,
  daysUntil,
  defaultPaidFrom,
  flagText,
  groupCategories,
  impactParts,
  spendSafe,
  validateLogSpending,
  type LogBucket,
} from "./log-spending-model";

const b = (id: string, name: string, groupKey: LogBucket["groupKey"], displayOrder: number, keptInAccountId: string | null = null): LogBucket => ({
  id,
  name,
  groupKey,
  hue: id,
  keptInAccountId,
  displayOrder,
});

const TODAY = "2026-10-11";
const ok = { amount: "180", categoryId: "cat-lunch", note: "", accountId: "acc-cash", date: TODAY };

describe("groupCategories", () => {
  it("orders by shelf group then display order, drops buckets with no category, sorts names", () => {
    const buckets = [b("tax", "Tax", "set_aside", 1), b("fun", "Fun", "spend", 7), b("living", "Living", "spend", 2), b("emerg", "Emergency", "save", 4), b("empty", "Empty", "save", 5)];
    const cats = [
      { id: "1", name: "Zoo", bucketId: "fun" },
      { id: "2", name: "Lunch", bucketId: "living" },
      { id: "3", name: "Fund", bucketId: "emerg" },
      { id: "4", name: "Income tax", bucketId: "tax" },
      { id: "5", name: "Apps", bucketId: "fun" },
    ];
    const g = groupCategories(buckets, cats);
    expect(g.map((x) => x.bucket.name)).toEqual(["Living", "Fun", "Emergency", "Tax"]);
    expect(g[1].categories.map((c) => c.name)).toEqual(["Apps", "Zoo"]);
  });
});

describe("daysUntil", () => {
  it("counts calendar days and handles month ends and missing paydays", () => {
    expect(daysUntil("2026-10-15", TODAY)).toBe(4);
    expect(daysUntil("2026-11-01", "2026-10-31")).toBe(1);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
    expect(daysUntil("2026-10-01", TODAY)).toBe(-10);
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil("nope", TODAY)).toBeNull();
  });
});

describe("defaultPaidFrom", () => {
  const accounts = [
    { id: "a1", name: "MariBank" },
    { id: "a2", name: "GCash" },
  ];
  it("uses the bucket's kept-in account when it is selectable, else the first account", () => {
    expect(defaultPaidFrom(b("x", "X", "spend", 1, "a2"), accounts)).toBe("a2");
    expect(defaultPaidFrom(b("x", "X", "spend", 1, "usd-account"), accounts)).toBe("a1");
    expect(defaultPaidFrom(b("x", "X", "spend", 1, null), accounts)).toBe("a1");
    expect(defaultPaidFrom(undefined, [])).toBe("");
  });
});

describe("validateLogSpending (BR 11.2)", () => {
  it("accepts a good entry and returns integer centavos; empty note becomes null", () => {
    const r = validateLogSpending({ ...ok, amount: "₱1,234.50" }, { todayIso: TODAY });
    expect(r).toEqual({ ok: true, value: { amountMinor: 123_450, categoryId: "cat-lunch", note: null, accountId: "acc-cash", date: TODAY } });
  });
  it("trims and strips markup from the note, capped at 60 characters", () => {
    const r = validateLogSpending({ ...ok, note: `  <b>${"x".repeat(80)}  ` }, { todayIso: TODAY });
    expect(r.ok && r.value.note).toBe("b" + "x".repeat(59));
  });
  it.each(["", "0", "-5", "abc", "1.234"])("rejects amount %j with the SPEC copy", (amount) => {
    const r = validateLogSpending({ ...ok, amount }, { todayIso: TODAY });
    expect(r).toMatchObject({ ok: false, first: "amount", errors: { amount: "Enter what you spent, above ₱0." } });
  });
  it("caps the amount at ₱10,000,000.00", () => {
    expect(validateLogSpending({ ...ok, amount: "10,000,000" }, { todayIso: TODAY }).ok).toBe(true);
    expect(validateLogSpending({ ...ok, amount: "10,000,000.01" }, { todayIso: TODAY })).toMatchObject({
      ok: false,
      errors: { amount: "That amount looks too large. Check the number of zeros." },
    });
  });
  it("needs a category, a valid date that is not in the future, and an account; reports the first in field order", () => {
    expect(validateLogSpending({ ...ok, categoryId: "" }, { todayIso: TODAY })).toMatchObject({
      first: "category",
      errors: { category: "Pick a category, so it comes out of the right bucket." },
    });
    expect(validateLogSpending({ ...ok, date: "2026-10-12" }, { todayIso: TODAY })).toMatchObject({ first: "date" });
    expect(validateLogSpending({ ...ok, date: "2026-02-30" }, { todayIso: TODAY })).toMatchObject({ first: "date" });
    expect(validateLogSpending({ ...ok, accountId: "" }, { todayIso: TODAY })).toMatchObject({ first: "account" });
    expect(validateLogSpending({ ...ok, amount: "", categoryId: "" }, { todayIso: TODAY })).toMatchObject({ first: "amount" });
  });
});

describe("impact line (BR 11.3, P-2)", () => {
  const living = b("living", "Living", "spend", 2);
  it("spec example: Living ₱9,500.00 left, ₱180 -> ₱9,320.00, per-day floors to whole pesos", () => {
    // safe = Living 9,500 + Fun 2,000 = 11,500; after = 11,320 / 4 days = 2,830
    const i = computeImpact({ bucket: living, leftMinor: 950_000, safeMinor: 1_150_000, daysUntilPayday: 4, amountMinor: 18_000 });
    expect(i).toMatchObject({ leftAfter: 932_000, perDayAfter: 283_000, days: 4, isSpendBucket: true });
    expect(impactParts(i)).toEqual({ lead: "From Living: ₱9,500.00 left", after: "₱9,320.00", negative: false, perDay: "About ₱2,830 a day after this, for 4 days" });
  });
  it("floors a fractional per-day and never shows below ₱0 per day", () => {
    const i = computeImpact({ bucket: living, leftMinor: 100_000, safeMinor: 100_000, daysUntilPayday: 3, amountMinor: 1 });
    expect(impactParts(i).perDay).toBe("About ₱333 a day after this, for 3 days");
    const over = computeImpact({ bucket: living, leftMinor: 10_000, safeMinor: 10_000, daysUntilPayday: 2, amountMinor: 30_000 });
    expect(over.perDayAfter).toBe(0);
    expect(impactParts(over)).toMatchObject({ after: "−₱200.00", negative: true });
  });
  it("shows just the left before an amount is typed; payday today counts as 1 day; no payday hides per-day", () => {
    expect(impactParts(computeImpact({ bucket: living, leftMinor: 950_000, safeMinor: 950_000, daysUntilPayday: 4, amountMinor: null }))).toMatchObject({ after: null, perDay: null });
    expect(computeImpact({ bucket: living, leftMinor: 100_000, safeMinor: 100_000, daysUntilPayday: 0, amountMinor: 10_000 })).toMatchObject({ days: 1, perDayAfter: 90_000 });
    expect(computeImpact({ bucket: living, leftMinor: 100_000, safeMinor: 100_000, daysUntilPayday: null, amountMinor: 10_000 })).toMatchObject({ days: null, perDayAfter: null });
  });
  it("Save and Set aside buckets have no per-day line", () => {
    const i = computeImpact({ bucket: b("e", "Emergency", "save", 4), leftMinor: 500_000, safeMinor: 100_000, daysUntilPayday: 4, amountMinor: 10_000 });
    expect(i.perDayAfter).toBeNull();
    expect(impactParts(i).perDay).toBeNull();
  });
  it("spendSafe sums only Spend buckets", () => {
    expect(spendSafe([living, b("fun", "Fun", "spend", 7), b("e", "Emergency", "save", 4)], { living: 100, fun: -30, e: 999 })).toBe(70);
  });
});

describe("flagText (SPEC §1)", () => {
  it("matches the spec sentence", () => {
    expect(flagText({ amountMinor: 18_000, label: "Lunch", impact: { bucketName: "Living", bucketLeftMinor: 932_000, isSpendBucket: true, perDayMinor: 301_800 } })).toBe(
      "Logged ₱180.00 for Lunch. Living has ₱9,320.00 left. Safe to spend: about ₱3,018 a day.",
    );
  });
  it("leaves the safe-to-spend sentence out for non-Spend buckets or no payday", () => {
    expect(flagText({ amountMinor: 5_000, label: "Fee", impact: { bucketName: "Tax", bucketLeftMinor: -1_000, isSpendBucket: false, perDayMinor: null } })).toBe(
      "Logged ₱50.00 for Fee. Tax has −₱10.00 left.",
    );
  });
});
