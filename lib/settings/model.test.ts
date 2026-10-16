import { describe, expect, it } from "vitest";
import { amountText, cleanName, isRhythm, parseIncomeForm, payFrequencyOf, perDayLine, perDayMinor } from "./model";

describe("payFrequencyOf", () => {
  it("keeps the usual rhythms and reads quarterly and semester as varies", () => {
    expect(payFrequencyOf("weekly")).toBe("weekly");
    expect(payFrequencyOf("biweekly")).toBe("biweekly");
    expect(payFrequencyOf("twice")).toBe("twice");
    expect(payFrequencyOf("monthly")).toBe("monthly");
    expect(payFrequencyOf("quarterly")).toBe("varies");
    expect(payFrequencyOf("semester")).toBe("varies");
    expect(payFrequencyOf("varies")).toBe("varies");
  });
});

describe("isRhythm", () => {
  it("accepts the seven and nothing else", () => {
    expect(isRhythm("semester")).toBe(true);
    expect(isRhythm("daily")).toBe(false);
    expect(isRhythm(null)).toBe(false);
  });
});

describe("perDayMinor", () => {
  it("floors integer centavos over the days one payment has to last", () => {
    expect(perDayMinor(150000, "weekly")).toBe(21428); // 1,500 / 7 days
    expect(perDayMinor(300000, "monthly")).toBe(10000);
    expect(perDayMinor(910000, "quarterly")).toBe(10000);
    expect(Number.isInteger(perDayMinor(123457, "biweekly"))).toBe(true);
  });
  it("is null when it varies or something is missing", () => {
    expect(perDayMinor(150000, "varies")).toBeNull();
    expect(perDayMinor(null, "weekly")).toBeNull();
    expect(perDayMinor(150000, null)).toBeNull();
    expect(perDayMinor(0, "weekly")).toBeNull();
  });
  it("words the live line like onboarding", () => {
    expect(perDayLine(300000, "monthly")).toBe("About ₱100 a day.");
    expect(perDayLine(150000, "weekly")).toBe("About ₱214.28 a day.");
    expect(perDayLine(150000, "varies")).toBeNull();
  });
});

describe("amountText", () => {
  it("shows a stored amount the way people type it", () => {
    expect(amountText(null)).toBe("");
    expect(amountText(150000)).toBe("1,500");
    expect(amountText(150050)).toBe("1,500.50");
  });
});

describe("parseIncomeForm", () => {
  const today = "2026-10-16";
  const ok = (f: Partial<Parameters<typeof parseIncomeForm>[0]>, stored: string | null = null) =>
    parseIncomeForm({ amountText: "1,500", rhythm: "quarterly", next: "2026-12-01", ...f }, today, stored);

  it("returns integer centavos, the rhythm and the date", () => {
    expect(ok({})).toEqual({ ok: true, value: { amountMinor: 150000, rhythm: "quarterly", next: "2026-12-01" } });
  });
  it("treats empty pieces as not set", () => {
    expect(ok({ amountText: " ", rhythm: null, next: "" })).toEqual({ ok: true, value: { amountMinor: null, rhythm: null, next: null } });
  });
  it("refuses a bad amount with a message that says what to do", () => {
    expect(ok({ amountText: "abc" })).toEqual({ ok: false, error: "Enter an amount like 1,500." });
    expect(ok({ amountText: "0" })).toEqual({ ok: false, error: "Enter an amount above ₱0." });
    expect(ok({ amountText: "1.234" })).toEqual({ ok: false, error: "Use at most two decimal places." });
    expect(ok({ amountText: "99,999,999" })).toEqual({ ok: false, error: "That amount looks too large. Check the number of zeros." });
  });
  it("refuses a past date unless it is the date already saved", () => {
    expect(ok({ next: "2026-10-15" })).toEqual({ ok: false, error: "Pick today or a later date, or say you're not sure." });
    expect(ok({ next: "2026-10-16" }).ok).toBe(true);
    expect(ok({ next: "2026-10-10" }, "2026-10-10").ok).toBe(true);
  });
  it("refuses something that is not a date", () => {
    expect(ok({ next: "soon" }).ok).toBe(false);
  });
});

describe("cleanName", () => {
  it("trims, turns empty into none and caps at 60", () => {
    expect(cleanName("  Mika ")).toEqual({ ok: true, value: "Mika" });
    expect(cleanName("   ")).toEqual({ ok: true, value: null });
    expect(cleanName("x".repeat(60)).ok).toBe(true);
    expect(cleanName("x".repeat(61))).toEqual({ ok: false, error: "Keep your name to 60 letters or fewer." });
  });
});
