import { describe, expect, it } from "vitest";
import { emptyDraft, type OnboardingDraft } from "./draft";
import { backPatch, chooseYes, completedProps, confirmSplit, doneLines, finalDraft, finishAfter, parseSummary, previewFirstPay, setTick, stageOf, submitEntry, validateEntry } from "./first-pay";

const TODAY = "2026-10-12";
const acct = (id: string, name: string, type: OnboardingDraft["accounts"][number]["type"]) => ({ id, name, type, currency: "PHP" as const, isNew: true });

/** The O1 web-path draft of supabase/tests/61_finish_onboarding.sql (O6 homes: 4 transfers out of BPI). */
const o1 = (over: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  ...emptyDraft(),
  path: "web",
  step: "first",
  firstName: "Rolf",
  income: { kind: "salary", amountMinor: 2_500_000, frequency: "twice", nextPayday: "2026-10-21", paidInOtherCurrency: false },
  sources: [{ key: "main", name: "Salary", kind: "salary", rule: "plan", wholeBucket: null, ownSplit: null, landsInAccountId: "bpi", categoryId: null, isMain: true }],
  accounts: [acct("gcash", "GCash", "eWallet"), acct("bpi", "BPI", "bank"), acct("maya", "Maya", "eWallet"), acct("tonik", "Tonik", "savings"), acct("mp2", "Pag-IBIG MP2", "investment")],
  landingAccountId: "bpi",
  priority: "safety",
  billsMinor: 600_000,
  billKinds: ["rent"],
  planA: { living: 38, rent: 12, fun: 10, emergency: 25, invest: 5, sinking: 10, tax: 0, buffer: 0 },
  targetMinor: 7_500_000,
  homes: { living: "gcash", fun: "maya", rent: "bpi", tax: "bpi", buffer: "bpi", emergency: "tonik", sinking: "tonik", invest: "mp2" },
  firstPay: { choice: "yes", entryId: "pay-1", amountMinor: 2_500_000, date: "2026-10-07", splitConfirmed: false, ticked: [], reminder: "none" },
  ...over,
});

const fp = (d: OnboardingDraft, patch: Partial<OnboardingDraft["firstPay"]>): OnboardingDraft => ({ ...d, firstPay: { ...d.firstPay, ...patch } });

describe("preview: O1 + O6", () => {
  const p = previewFirstPay(o1())!;
  it("splits ₱25,000 exactly like the SQL engine (O1)", () => {
    expect(Object.fromEntries(p.lines.map((l) => [l.bucket, l.amountMinor]))).toEqual({ living: 950_000, rent: 300_000, fun: 250_000, emergency: 625_000, invest: 125_000, sinking: 250_000 });
    expect(p.lines.reduce((t, l) => t + l.amountMinor, 0)).toBe(2_500_000);
  });
  it("has exactly 4 transfers out of BPI, and Rent stays put (O6)", () => {
    expect(p.transfers).toHaveLength(4);
    expect(Object.fromEntries(p.transfers.map((t) => [t.toAccountId, t.amountMinor]))).toEqual({ gcash: 950_000, maya: 250_000, tonik: 875_000, mp2: 125_000 });
    expect(p.transfers.every((t) => t.fromAccountId === "bpi")).toBe(true);
    expect(p.keeps).toEqual([{ accountId: "bpi", name: "BPI", amountMinor: 300_000, labels: ["Rent"] }]);
    expect(p.transfers.find((t) => t.toAccountId === "tonik")?.labels).toEqual(["Emergency", "Sinking funds"]);
  });
  it("sends the rent share to Emergency while bills start later (O2)", () => {
    const later = previewFirstPay(o1({ billsStart: "2027-01-01" }))!;
    expect(later.lines.find((l) => l.bucket === "rent")).toBeUndefined();
    expect(later.lines.find((l) => l.bucket === "emergency")?.amountMinor).toBe(925_000);
    expect(later.billsNote).toBe("Rent's 12% goes to your Emergency fund until Jan 1.");
    expect(later.keeps).toEqual([]);
    expect(later.transfers).toHaveLength(4);
    // a pay dated after the start is not redirected
    expect(previewFirstPay(o1({ billsStart: "2026-10-01" }))!.billsNote).toBeNull();
  });
  it("is null until it can be computed", () => {
    expect(previewFirstPay(o1({ planA: null }))).toBeNull();
    expect(previewFirstPay(fp(o1(), { amountMinor: null }))).toBeNull();
    expect(previewFirstPay(o1({ planA: { living: 90, rent: 0, fun: 0, emergency: 0, invest: 0, sinking: 0, tax: 0, buffer: 0 } }))).toBeNull();
  });
  it("splits odd amounts to the centavo", () => {
    const odd = previewFirstPay(fp(o1(), { amountMinor: 1_234_567 }))!;
    expect(odd.lines.reduce((t, l) => t + l.amountMinor, 0)).toBe(1_234_567);
  });
});

describe("skipped drafts (just track)", () => {
  const skipped = o1({ skipped: true, planA: null, homes: null, priority: null, billKinds: [], billsMinor: 0 });
  it("have no transfers, and Confirm split finishes", () => {
    const p = previewFirstPay(skipped)!;
    expect(p.lines).toEqual([{ bucket: "living", label: "Spending", amountMinor: 2_500_000 }]);
    expect(p.transfers).toEqual([]);
    expect(stageOf(skipped)).toBe("split");
    expect(finishAfter(skipped)).toBeNull();
    expect(finishAfter({ ...skipped, ...confirmSplit(skipped) })).toBe("done");
  });
  it("say everything stays where it landed", () => {
    const lines = doneLines(skipped, null);
    expect(lines.map((l) => l.text)).toContain("Everything stays where it landed");
    expect(lines[0]?.text).toBe("₱25,000.00 split into 1 bucket");
    expect(lines.find((l) => l.key === "emergency")).toBeUndefined();
  });
});

describe("stages", () => {
  const base = o1({ firstPay: { choice: null, entryId: null, amountMinor: null, date: null, splitConfirmed: false, ticked: [], reminder: "none" } });
  it("walks entry, form, split, move", () => {
    expect(stageOf(base)).toBe("entry");
    const yes = { ...base, ...chooseYes(base) };
    expect(yes.firstPay.amountMinor).toBe(2_500_000); // the usual amount
    expect(stageOf(yes)).toBe("form");
    const date = fp(yes, { date: "2026-10-10" });
    expect(validateEntry(date, TODAY)).toBeNull();
    const split = { ...date, ...submitEntry(date, () => "new-id") };
    expect(split.firstPay.entryId).toBe("new-id");
    expect(stageOf(split)).toBe("split");
    const move = { ...split, ...confirmSplit(split) };
    expect(stageOf(move)).toBe("move");
    expect(finishAfter(move)).toBeNull();
  });
  it("keeps the entry id on a retry", () => {
    const d = fp(o1(), { entryId: "keep-me" });
    expect(submitEntry(d, () => "other").firstPay?.entryId).toBe("keep-me");
  });
  it("Back walks the stages in reverse and leaves the step only from entry", () => {
    const move = fp(o1(), { splitConfirmed: true });
    const split = { ...move, ...backPatch(move) };
    expect(stageOf(split)).toBe("split");
    const form = { ...split, ...backPatch(split) };
    expect(stageOf(form)).toBe("form");
    expect(form.firstPay.amountMinor).toBe(2_500_000); // what they typed stays
    const entry = { ...form, ...backPatch(form) };
    expect(stageOf(entry)).toBe("entry");
    expect(backPatch(entry)).toBeNull();
    const later = fp(o1(), { choice: "later" });
    expect(stageOf(later)).toBe("later");
    expect(stageOf({ ...later, ...backPatch(later) })).toBe("entry");
  });
  it("app path goes straight to the split with the phone's entry", () => {
    const app = o1({ path: "app" });
    expect(stageOf(app)).toBe("split");
    expect({ ...app, ...backPatch(app) }.firstPay.choice).toBeNull();
  });
  it("later finishes to Today", () => expect(finishAfter(fp(o1(), { choice: "later" }))).toBe("today"));
  it("validates the form", () => {
    expect(validateEntry(fp(o1(), { amountMinor: null }), TODAY)?.field).toBe("ob-fp-amount");
    expect(validateEntry(fp(o1(), { amountMinor: 2_000_000_000 }), TODAY)?.message).toMatch(/too large/);
    expect(validateEntry(fp(o1(), { date: null }), TODAY)?.field).toBe("ob-fp-date");
    expect(validateEntry(fp(o1(), { date: "2026-10-13" }), TODAY)?.field).toBe("ob-fp-date");
    expect(validateEntry(fp(o1(), { date: TODAY }), TODAY)).toBeNull();
  });
});

describe("ticked transfers", () => {
  const move = fp(o1(), { splitConfirmed: true });
  it("count by pair and finish once all are ticked", () => {
    let ticked = move.firstPay.ticked;
    for (const t of previewFirstPay(move)!.transfers) {
      expect(finishAfter(fp(move, { ticked }))).toBeNull();
      ticked = setTick(ticked, t.fromAccountId, t.toAccountId, true);
    }
    const all = fp(move, { ticked });
    expect(previewFirstPay(all)!.sentCount).toBe(4);
    expect(finishAfter(all)).toBe("done");
    expect(setTick(ticked, "bpi", "tonik", false)).toHaveLength(3);
    expect(setTick(ticked, "bpi", "tonik", true)).toHaveLength(4); // no duplicates
  });
  it("drop pairs the plan no longer has", () => {
    const d = fp(move, { ticked: [{ fromAccountId: "bpi", toAccountId: "gcash" }, { fromAccountId: "bpi", toAccountId: "gone" }] });
    expect(finalDraft(d).firstPay.ticked).toEqual([{ fromAccountId: "bpi", toAccountId: "gcash" }]);
    expect(confirmSplit(d).firstPay?.ticked).toHaveLength(1);
    expect(completedProps(d, 3).transfers_ticked).toBe(1);
  });
});

describe("Done card", () => {
  const summary = parseSummary({ bucketsCount: 7, splitMinor: 2_500_000, splitBucketsCount: 6, transfersCount: 4, transfersTicked: 4, safeToSpendMinor: 1_200_000, emergencyLeftMinor: 625_000, spendingBeforeMinor: 0 });
  it("uses the O6 summary", () => {
    expect(doneLines(o1(), summary).map((l) => l.text)).toEqual([
      "₱25,000.00 split into 6 buckets",
      "Your accounts match your plan",
      "Safe to spend until Oct 21: ₱12,000.00",
      "Your Emergency fund has started: ₱6,250.00",
    ]);
  });
  it("says so when logged spending is already counted", () => {
    const s = parseSummary({ ...summary, safeToSpendMinor: 1_150_000, spendingBeforeMinor: 50_000 });
    expect(doneLines(o1(), s)[2]?.text).toBe("Safe to spend until Oct 21: ₱11,500.00, after what you've already spent");
  });
  it("falls back to the draft's own numbers without a summary", () => {
    expect(doneLines(o1(), null).map((l) => l.text)).toEqual([
      "₱25,000.00 split into 6 buckets",
      "Your accounts match your plan",
      "Safe to spend until Oct 21: ₱12,000.00",
      "Your Emergency fund has started: ₱6,250.00",
    ]);
  });
  it("ignores a summary it can't read", () => expect(parseSummary({ splitMinor: "x" })).toBeNull());
});

describe("analytics props", () => {
  it("reports confirmed vs later", () => {
    expect(completedProps(fp(o1(), { splitConfirmed: true }), 2.6)).toEqual({ path: "web", plan_mode: "plan", first_pay: "confirmed", transfers_ticked: 0, minutes: 3 });
    expect(completedProps(fp(o1(), { choice: "later" }), 1)).toMatchObject({ first_pay: "later", transfers_ticked: 0 });
    expect(completedProps(o1({ skipped: true }), 1).plan_mode).toBe("track");
  });
});
