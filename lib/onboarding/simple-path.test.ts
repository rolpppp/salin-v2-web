import { describe, expect, it } from "vitest";
import { emptyDraft, type OnboardingDraft } from "./draft";
import { stepsFor } from "./route";
import { isSimple, moneySlipRows, moneySplit, perDayFor, rhythmOnEnter, setRhythm, startPattern, untilFor, validateFirstMoney, validateRhythm } from "./simple-path";

const TODAY = "2026-10-14"; // a Wednesday

const started = (pattern: "allowance" | "mix" = "allowance"): OnboardingDraft => ({ ...emptyDraft(), ...startPattern(pattern, "u1") });
const withRhythm = (d: OnboardingDraft, r: Partial<OnboardingDraft["rhythm"]>): OnboardingDraft => ({ ...d, ...setRhythm(d, r) });

describe("startPattern", () => {
  it("salary starts the usual web path", () => {
    expect(startPattern("salary", "u1")).toMatchObject({ pattern: "salary", path: "web", step: "income", skipped: false });
  });
  it("allowance and mix are just-tracking web drafts with Cash ticked as the landing account", () => {
    const d = started("mix");
    expect(d).toMatchObject({ pattern: "mix", path: "web", step: "accounts", skipped: true });
    expect(d.accounts.map((a) => a.name)).toEqual(["Cash"]);
    expect(d.landingAccountId).toBe(d.accounts[0].id);
    expect(isSimple(d)).toBe(true);
    expect(d.sources).toMatchObject([{ name: "Money in", kind: "allowance", isMain: true, landsInAccountId: d.landingAccountId }]);
  });
  it("hands out the same Cash id again for the same user", () => {
    expect(started().accounts[0].id).toBe(started().accounts[0].id);
  });
});

describe("steps", () => {
  it("allowance and mix are Accounts · Your rhythm · First money; salary keeps its six", () => {
    expect(stepsFor(started())).toEqual(["accounts", "rhythm", "money"]);
    expect(stepsFor({ ...emptyDraft(), path: "web", pattern: "salary" })).toEqual(["income", "accounts", "prio", "plan", "homes", "first"]);
    expect(stepsFor({ ...emptyDraft(), path: "web" })).toHaveLength(6);
  });
});

describe("rhythm", () => {
  it("copies the answers into the pay fields; quarterly and semester read as 'varies' there", () => {
    const d = withRhythm(started(), { amountMinor: 2_400_000, frequency: "semester", nextDate: "2027-01-10" });
    expect(d.income).toMatchObject({ kind: "allowance", amountMinor: 2_400_000, frequency: "varies", nextPayday: "2027-01-10" });
    expect(d.rhythm.frequency).toBe("semester");
  });
  it("validates in order: name, amount, frequency, a date in the past", () => {
    let d = started();
    expect(validateRhythm(d, { todayIso: TODAY })?.field).toBe("ob-name");
    d = { ...d, firstName: "Mika" };
    expect(validateRhythm(d, { todayIso: TODAY })?.field).toBe("ob-rhythm-amount");
    d = withRhythm(d, { amountMinor: 150_000 });
    expect(validateRhythm(d, { todayIso: TODAY })?.field).toBe("ob-rhythm-freq-weekly");
    d = withRhythm(d, { frequency: "weekly", nextDate: "2026-10-01" });
    expect(validateRhythm(d, { todayIso: TODAY })?.field).toBe("ob-rhythm-next");
    d = withRhythm(d, { nextDate: null });
    expect(validateRhythm(d, { todayIso: TODAY })).toBeNull();
  });
  it("entering the step keeps the source on the landing account, and is a no-op when nothing changed", () => {
    const d = started();
    expect(rhythmOnEnter(d)).toBeNull();
    expect(rhythmOnEnter({ ...d, landingAccountId: "elsewhere" })?.sources?.[0].landsInAccountId).toBe("elsewhere");
  });
});

describe("until", () => {
  it("a date counts the days up to it, not including it", () => {
    expect(untilFor(withRhythm(started(), { nextDate: "2026-10-21" }), TODAY)).toEqual({ day: "2026-10-21", days: 7, known: true });
  });
  it("no date falls back to the next Monday", () => {
    expect(untilFor(started(), TODAY)).toEqual({ day: "2026-10-19", days: 5, known: false });
  });
});

describe("first money", () => {
  const base = () => {
    let d = { ...started(), firstName: "Mika" } as OnboardingDraft;
    d = { ...d, accounts: [...d.accounts, { id: "g", name: "GCash", type: "eWallet", currency: "PHP", isNew: true }] };
    return withRhythm(d, { amountMinor: 150_000, frequency: "weekly", nextDate: "2026-10-21" });
  };
  const money = (d: OnboardingDraft, fm: Partial<OnboardingDraft["firstMoney"]>): OnboardingDraft => ({ ...d, firstMoney: { ...d.firstMoney, ...fm } });

  it("the landing account holds the remainder, so the rows add up", () => {
    const r = moneySplit(money(base(), { amountMinor: 200_000, extra: { g: 50_000 }, keepMinor: 30_000 }));
    expect(r).toMatchObject({ ok: true, landingMinor: 150_000, spendMinor: 170_000 });
    if (r.ok) expect(r.rows.map((x) => x.minor)).toEqual([150_000, 50_000]);
  });
  it("refuses more moved than held, and more kept than stays", () => {
    expect(moneySplit(money(base(), { amountMinor: 100_000, extra: { g: 120_000 } }))).toMatchObject({ ok: false, problem: "over_moved" });
    expect(moneySplit(money(base(), { amountMinor: 100_000, extra: { g: 60_000 }, keepMinor: 50_000 }))).toMatchObject({ ok: false, problem: "keep_too_big" });
  });
  it("requires an amount (Skip is the other way out)", () => {
    expect(validateFirstMoney(base())?.field).toBe("ob-money-amount");
    expect(validateFirstMoney(money(base(), { amountMinor: 100_000 }))).toBeNull();
  });
  it("per day = spendable ÷ days, floored, and the keep is not spendable", () => {
    // 7 days to Oct 21; 2,100.00 - 100.00 kept = 2,000.00 -> 285.71 -> 28571
    expect(perDayFor(money(base(), { amountMinor: 210_000, keepMinor: 10_000 }), TODAY)).toMatchObject({ perDayMinor: 28_571, days: 7, known: true });
    expect(perDayFor(money(base(), {}), TODAY)).toBeNull();
  });
  it("the slip fills as answers arrive", () => {
    const rows = Object.fromEntries(moneySlipRows(money(base(), { amountMinor: 210_000 }), TODAY).map((r) => [r.key, r.value]));
    expect(rows).toMatchObject({ for: "Mika", gets: "₱1,500", freq: "Every week", lands: "Cash", now: "₱2,100", day: "about ₱300" });
    expect(Object.values(Object.fromEntries(moneySlipRows(started(), TODAY).map((r) => [r.key, r.value]))).filter((v) => v === null).length).toBeGreaterThan(4);
  });
});
