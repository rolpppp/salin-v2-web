import { describe, expect, it } from "vitest";
import { BUCKET, accounts, buckets, income, moneyInData, sources } from "./money-in-testkit";
import {
  buildDoneSlip,
  buildSlip,
  computePreviews,
  confirmAllLabel,
  confirmErrorText,
  doneHow,
  headerCopy,
  hoursSince,
  initialChoice,
  isoDateIn,
  jobText,
  kindChipText,
  moneyInPhase,
  needsHelper,
  occurredAtFor,
  rateText,
  ruleJobText,
  shortDate,
  sortQueue,
  storedJob,
  summarizeQueue,
  validateAddIncome,
  whyText,
  type Choice,
  type Preview,
} from "./money-in-model";

const hueAmounts = (p: Preview | undefined) => {
  if (p?.kind !== "ready") throw new Error("not ready");
  return Object.fromEntries(p.lines.map((l) => [buckets.find((b) => b.id === l.bucketId)?.hue, l.amount]));
};

describe("queue grouping", () => {
  it("orders oldest first, ties by id", () => {
    const q = sortQueue([income("b", "work", 1, 9), income("a", "work", 1, 9), income("c", "work", 1, 7)]);
    expect(q.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("hides the kind chip when the name already says it", () => {
    expect(kindChipText({ name: "Side hustle", kind: "side_hustle" })).toBeNull();
    expect(kindChipText({ name: "DOST scholarship", kind: "scholarship" })).toBeNull();
    expect(kindChipText({ name: "Logo commissions", kind: "side_hustle" })).toBe("Side hustle");
  });

  it("summarises which incomes can be confirmed and the Confirm label", () => {
    const data = moneyInData({ incomes: [income("g2", "others", 2_300_000, 8), income("g5", "side", 350_000, 9), income("ask", "ask", 5_000, 10), income("bad", "bad", 100_000, 10)] });
    const s = summarizeQueue(data, computePreviews(data, {}));
    expect(s.readyIds).toEqual(["g2", "g5"]);
    expect(s.readyTotal).toBe(2_650_000);
    expect(s.needNames).toEqual(["Gift", "Commissions"]);
    expect(confirmAllLabel(s)).toBe("Confirm 2 · ₱26,500.00");
    expect(needsHelper(s.needNames, s.total)).toBe("Gift and Commissions need a job first.");
  });

  it("says Confirm all N only when every income is ready", () => {
    const data = moneyInData({ incomes: [income("g2", "others", 2_300_000, 8), income("g5", "side", 350_000, 9)] });
    const s = summarizeQueue(data, computePreviews(data, {}));
    expect(confirmAllLabel(s)).toBe("Confirm all 2 · ₱26,500.00");
    expect(needsHelper([], 2)).toBe("Each one uses the job shown on its row.");
    expect(needsHelper([], 1)).toBe("");
  });

  it("shows ₱0 and nothing ready when no income has a job", () => {
    const data = moneyInData({ incomes: [income("ask", "ask", 5_000, 10)] });
    const s = summarizeQueue(data, computePreviews(data, {}));
    expect(s.readyIds).toEqual([]);
    expect(confirmAllLabel(s)).toBe("Confirm · ₱0.00");
  });
});

describe("job resolution and the live preview (goldens)", () => {
  it("G2: plan job, before 2027, rent goes to Emergency", () => {
    const data = moneyInData({ incomes: [income("g2", "others", 2_300_000, 8)] });
    const p = computePreviews(data, {}).get("g2");
    expect(hueAmounts(p)).toEqual({ tax: 138_000, living: 161_000, emergency: 736_000, invest: 690_000, sinking: 230_000, fun: 230_000, buffer: 115_000 });
    expect(p?.kind === "ready" && p.planKey).toBe("A");
    expect(p?.kind === "ready" && p.lines.reduce((t, l) => t + l.amount, 0)).toBe(2_300_000);
    expect(jobText(p as Preview, data.incomes[0], sources[0], buckets)).toBe("Split by Plan A");
  });

  it("G5: own split 10/40/50 of ₱3,500", () => {
    const data = moneyInData({ incomes: [income("g5", "side", 350_000, 9)] });
    const p = computePreviews(data, {}).get("g5");
    expect(hueAmounts(p)).toEqual({ tax: 35_000, sinking: 140_000, fun: 175_000 });
    expect(jobText(p as Preview, data.incomes[0], sources[2], buckets)).toBe("Own split: Tax 10 · Sinking funds 40 · Fun money 50");
  });

  it("G6: an own split of 90% has no job and is never rescaled", () => {
    const data = moneyInData({ incomes: [income("bad", "bad", 100_000, 10)] });
    const p = computePreviews(data, {}).get("bad");
    expect(p).toMatchObject({ kind: "needs", reason: "own_split_incomplete", totalBp: 9000 });
    expect(jobText(p as Preview, data.incomes[0], sources[3], buckets)).toBe("Its split adds to 90%, fix it in Plans");
  });

  it("an 'ask' source needs a job until one is picked, then the pick wins over the rule", () => {
    const data = moneyInData({ incomes: [income("ask", "ask", 100_000, 10)] });
    expect(computePreviews(data, {}).get("ask")).toMatchObject({ kind: "needs", reason: "ask" });
    expect(jobText(computePreviews(data, {}).get("ask") as Preview, data.incomes[0], sources[5], buckets)).toBe("Needs a job");
    const picked: Record<string, Choice> = { ask: { pick: "plan", oneBucketId: null } };
    expect(computePreviews(data, picked).get("ask")?.kind).toBe("ready");
    // a pick on a source whose own split is broken also makes it confirmable
    const bad = moneyInData({ incomes: [income("bad", "bad", 100_000, 10)] });
    expect(computePreviews(bad, { bad: { pick: "plan", oneBucketId: null } }).get("bad")?.kind).toBe("ready");
  });

  it("whole: kept in the source's bucket", () => {
    const data = moneyInData({ incomes: [income("allow", "allow", 150_000, 10)] });
    const p = computePreviews(data, {}).get("allow");
    expect(hueAmounts(p)).toEqual({ living: 150_000 });
    expect(jobText(p as Preview, data.incomes[0], sources[4], buckets)).toBe("Kept whole in Living");
  });

  it("one-off: all to the chosen bucket, Emergency by default, never Rent", () => {
    const data = moneyInData({ incomes: [income("ask", "ask", 5_000, 10)] });
    expect(hueAmounts(computePreviews(data, { ask: { pick: "one", oneBucketId: null } }).get("ask"))).toEqual({ emergency: 5_000 });
    expect(hueAmounts(computePreviews(data, { ask: { pick: "one", oneBucketId: BUCKET.fun } }).get("ask"))).toEqual({ fun: 5_000 });
    const rent = computePreviews(data, { ask: { pick: "one", oneBucketId: BUCKET.rent } }).get("ask");
    expect(rent).toMatchObject({ kind: "error", message: "Rent can't be picked for a one-off. Choose another bucket." });
  });

  it("evaluates the active plan per income in date order, so the first can switch the plan for the next", () => {
    // Emergency is ₱1 short of the switch: G2's Emergency share (₱7,360) pushes it past the target.
    const data = moneyInData({
      incomes: [income("late", "others", 2_300_000, 9), income("early", "others", 2_300_000, 8)],
      plan: { ...moneyInData().plan, emergencyAllocatedSoFar: 4_999_999 },
    });
    const previews = computePreviews(data, {});
    const early = previews.get("early");
    const late = previews.get("late");
    expect(early?.kind === "ready" && early.planKey).toBe("A");
    expect(late?.kind === "ready" && late.planKey).toBe("B");
    // Plan B: Emergency 10% plus Rent's 2% redirected, Investments 50%
    expect(hueAmounts(late)).toMatchObject({ emergency: 276_000, invest: 1_150_000 });
    expect(jobText(late as Preview, data.incomes[0], sources[0], buckets)).toBe("Split by Plan B");
  });

  it("income on or after the rent start date keeps Rent's own share", () => {
    const data = moneyInData({ incomes: [income("new", "others", 1_000_000, 8, { engineDate: "2027-01-01" })] });
    expect(hueAmounts(computePreviews(data, {}).get("new"))).toMatchObject({ rent: 20_000 });
  });

  it("a plan that doesn't add to 100% is an error preview, not a crash", () => {
    const data = moneyInData({
      incomes: [income("g2", "others", 2_300_000, 8)],
      plan: { ...moneyInData().plan, planA: [{ bucketId: BUCKET.living, bp: 5000 }] },
    });
    expect(computePreviews(data, {}).get("g2")).toMatchObject({ kind: "error", message: "Your plan doesn't add up to 100%, fix it in Plans" });
  });

  it("an income with no source needs a job, but a picked job works", () => {
    const data = moneyInData({ incomes: [income("x", null, 100_000, 8)] });
    expect(computePreviews(data, {}).get("x")?.kind).toBe("needs");
    expect(computePreviews(data, { x: { pick: "plan", oneBucketId: null } }).get("x")?.kind).toBe("ready");
  });

  it("every ready preview sums exactly to the income", () => {
    for (const amount of [1, 333, 1_000_001, 1_732_900, 99_999_999]) {
      const data = moneyInData({ incomes: [income("a", "others", amount, 8), income("b", "side", amount, 9)] });
      for (const p of computePreviews(data, {}).values()) {
        expect(p.kind === "ready" && p.lines.reduce((t, l) => t + l.amount, 0)).toBe(amount);
      }
    }
  });
});

describe("choice storage", () => {
  it("maps the radio cards to what income_meta stores", () => {
    expect(storedJob({ metaJob: null }, { pick: "rule", oneBucketId: null })).toEqual({ job: null, oneBucketId: null });
    expect(storedJob({ metaJob: "own" }, { pick: "rule", oneBucketId: null })).toEqual({ job: "own", oneBucketId: null });
    expect(storedJob({ metaJob: null }, { pick: "plan", oneBucketId: BUCKET.fun })).toEqual({ job: "plan", oneBucketId: null });
    expect(storedJob({ metaJob: null }, { pick: "one", oneBucketId: BUCKET.fun })).toEqual({ job: "one", oneBucketId: BUCKET.fun });
  });

  it("starts from a stored pick", () => {
    expect(initialChoice({ metaJob: "plan", oneBucketId: null })).toEqual({ pick: "plan", oneBucketId: null });
    expect(initialChoice({ metaJob: "one", oneBucketId: BUCKET.fun })).toEqual({ pick: "one", oneBucketId: BUCKET.fun });
    expect(initialChoice({ metaJob: null, oneBucketId: null }).pick).toBe("rule");
  });
});

describe("slip math", () => {
  const data = moneyInData({ incomes: [income("g2", "others", 2_300_000, 8), income("g5", "side", 350_000, 9, { accountId: "gcash" }), income("ask", "ask", 5_000, 10)] });
  const previews = computePreviews(data, {});

  it("for one income: lines in bucket order, percent, total equals the amount, and the why", () => {
    const s = buildSlip(data, previews, "g2");
    expect(s.scope).toBe("one");
    expect(s.title).toBe("Others");
    expect(s.meta).toBe("Oct 8 · landed in MariBank");
    expect(s.lines.map((l) => l.name)).toEqual(["Tax", "Living", "Emergency fund", "Investments", "Sinking funds", "Fun money", "Buffer"]);
    expect(s.lines.find((l) => l.name === "Emergency fund")).toMatchObject({ amount: 736_000, bp: 3200 });
    expect(s.total).toBe(2_300_000);
    expect(s.unassigned).toBe(0);
    expect(s.why).toBe("Rent's 2% went to Emergency fund until Jan 1, 2027. Plan A runs until the Emergency fund reaches ₱50,000.00.");
  });

  it("for an income with no job: no lines, the reason is the note", () => {
    const s = buildSlip(data, previews, "ask");
    expect(s.lines).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.unassigned).toBe(5_000);
    expect(s.note).toBe("Needs a job");
  });

  it("with nothing selected: all waiting income combined, with the unassigned part named", () => {
    const s = buildSlip(data, previews, null);
    expect(s.scope).toBe("all");
    expect(s.meta).toBe("3 incomes");
    expect(s.total).toBe(2_650_000);
    expect(s.unassigned).toBe(5_000);
    expect(s.note).toBe("₱50.00 has no job yet and isn't counted above.");
    const tax = s.lines.find((l) => l.name === "Tax");
    expect(tax?.amount).toBe(138_000 + 35_000);
  });

  it("explains Plan B and own/whole/one", () => {
    expect(whyText({ kind: "ready", job: "own", lines: [], bps: new Map() }, data.incomes[1], data)).toBe("Its own split, applied to this amount.");
    expect(whyText({ kind: "ready", job: "plan", planKey: "B", lines: [], bps: new Map() }, income("x", "work", 1, 8, { engineDate: "2027-02-01" }), data)).toBe(
      "Plan B applies now that the Emergency fund reached ₱50,000.00.",
    );
    expect(whyText({ kind: "needs", reason: "ask" }, data.incomes[0], data)).toBeNull();
  });

  it("the done slip lists what the cycle confirmed", () => {
    const s = buildDoneSlip([
      { entryId: "a", name: "Work", how: "Split by Plan A", amountMinor: 1_732_900 },
      { entryId: "b", name: "Side hustle", how: "Own split", amountMinor: 350_000 },
    ]);
    expect(s.total).toBe(2_082_900);
    expect(s.meta).toBe("2 incomes given a job");
  });
});

describe("screen state", () => {
  const done = [{ entryId: "a", name: "Work", how: "Split by Plan A", amountMinor: 100 }];
  const now = Date.UTC(2026, 9, 11, 6, 0, 0);

  it("picks the header by state", () => {
    expect(headerCopy("waiting", 2).title).toBe("Give your money a job");
    expect(headerCopy("waiting", 2).lede).toContain("2 incomes are waiting");
    expect(headerCopy("waiting", 1).lede).toContain("1 income is waiting");
    expect(headerCopy("move", 0).title).toBe("Move the money");
    expect(headerCopy("all_done", 0).title).toBe("Every peso has a home");
    expect(headerCopy("empty", 0)).toEqual({ title: "Nothing waiting", lede: "Money from any source shows up here: salary, scholarship, side hustle, allowance." });
  });

  it("derives the phase", () => {
    const wait = [income("a", "work", 1, 8)];
    expect(moneyInPhase({ incomes: wait, done, cycle: null, timeZone: "Asia/Manila" }, now)).toBe("waiting");
    expect(moneyInPhase({ incomes: [], done: [], cycle: null, timeZone: "Asia/Manila" }, now)).toBe("empty");
    expect(moneyInPhase({ incomes: [], done, cycle: { id: "c", closedAt: null }, timeZone: "Asia/Manila" }, now)).toBe("move");
    expect(moneyInPhase({ incomes: [], done, cycle: { id: "c", closedAt: now - 3_600_000 }, timeZone: "Asia/Manila" }, now)).toBe("all_done");
    // a cycle closed on an earlier day doesn't greet you with "Every peso has a home" today
    expect(moneyInPhase({ incomes: [], done, cycle: { id: "c", closedAt: now - 3 * 86_400_000 }, timeZone: "Asia/Manila" }, now)).toBe("empty");
  });

  it("formats dates", () => {
    expect(shortDate("2026-10-07")).toBe("Oct 7");
    expect(isoDateIn(Date.UTC(2026, 9, 10, 17, 0, 0), "Asia/Manila")).toBe("2026-10-11");
  });

  it("describes a source's rule for the Add income form", () => {
    expect(ruleJobText(sources[1], buckets)).toEqual({ kind: "job", text: "Split by Plan A" });
    expect(ruleJobText(sources[2], buckets)).toEqual({ kind: "job", text: "Own split: Tax 10 · Sinking funds 40 · Fun money 50" });
    expect(ruleJobText(sources[3], buckets).kind).toBe("pick");
    expect(ruleJobText(sources[3], buckets).text).toContain("adds to 90%");
    expect(ruleJobText(sources[4], buckets)).toEqual({ kind: "job", text: "Kept whole in Living" });
    expect(ruleJobText(sources[5], buckets)).toEqual({ kind: "pick", text: "You'll pick its job after adding it." });
  });

  it("knows the home account of each bucket kept in fixtures", () => {
    expect(accounts.find((a) => a.id === buckets[0].keptInAccountId)?.name).toBe("MariBank");
  });
});

describe("Add income validation (SPEC §2.2, BR §9)", () => {
  const ok = { sourceId: "work", amount: "17,410", date: "2026-10-11", landedIn: "mari", aud: "" };
  const opts = { todayIso: "2026-10-11", showAud: true };

  it("accepts the documented formats and returns integer centavos", () => {
    for (const [typed, minor] of [["17,410", 1_741_000], ["17410.5", 1_741_050], ["₱17,410", 1_741_000]] as const) {
      const v = validateAddIncome({ ...ok, amount: typed }, opts);
      expect(v.ok && v.value.amountMinor).toBe(minor);
    }
  });

  it("says exactly what is wrong, with the SPEC copy", () => {
    const e = (patch: object, showAud = true) => {
      const v = validateAddIncome({ ...ok, ...patch }, { ...opts, showAud });
      return v.ok ? null : v;
    };
    expect(e({ amount: "" })?.errors.amount).toBe("Enter the amount you received, above ₱0.");
    expect(e({ amount: "0" })?.errors.amount).toBe("Enter the amount you received, above ₱0.");
    expect(e({ amount: "abc" })?.errors.amount).toBe("Enter the amount you received, above ₱0.");
    expect(e({ amount: "10,000,000.01" })?.errors.amount).toBe("That amount looks too large. Check the number of zeros.");
    expect(e({ aud: "four hundred" })?.errors.aud).toBe("The A$ amount isn't a number. Fix it or leave it empty.");
    expect(e({ aud: "four hundred" }, false)).toBeNull(); // the AUD field only exists for salary sources
    expect(e({ date: "2026-10-12" })?.errors.date).toContain("Pick today or an earlier date");
    expect(e({ date: "" })?.errors.date).toBe("Pick the date you received it.");
    expect(e({ sourceId: "" })?.errors.source).toBe("Pick where the money came from.");
    expect(e({ landedIn: "" })?.errors.landedIn).toBe("Pick the account it landed in.");
  });

  it("focuses the first problem in form order", () => {
    const v = validateAddIncome({ ...ok, amount: "", date: "2030-01-01" }, opts);
    expect(!v.ok && v.first).toBe("amount");
    const w = validateAddIncome({ ...ok, date: "2030-01-01", aud: "x" }, opts);
    expect(!w.ok && w.first).toBe("date");
  });

  it("keeps A$ in integer centavos and an empty A$ as null", () => {
    const v = validateAddIncome({ ...ok, aud: "400" }, opts);
    expect(v.ok && v.value.audMinor).toBe(40_000);
    const w = validateAddIncome(ok, opts);
    expect(w.ok && w.value.audMinor).toBeNull();
  });

  it("G11: rate is integer math, half up", () => {
    expect(rateText("17,410", "400")).toBe("Rate you got: ₱43.53 per A$1");
    expect(rateText("17,410", "")).toBe("Add the A$ amount to track the rate you got.");
    expect(rateText("", "400")).toBe("Add the A$ amount to track the rate you got.");
  });

  it("stores today at the real time and an earlier day at noon Manila", () => {
    const now = Date.UTC(2026, 9, 11, 9, 30, 0);
    expect(occurredAtFor("2026-10-11", "2026-10-11", now)).toBe(now);
    expect(occurredAtFor("2026-10-07", "2026-10-11", now)).toBe(Date.UTC(2026, 9, 7, 4, 0, 0));
    expect(isoDateIn(occurredAtFor("2026-10-07", "2026-10-11", now), "Asia/Manila")).toBe("2026-10-07");
    expect(() => occurredAtFor("nope", "2026-10-11", now)).toThrow();
  });

  it("counts whole hours since landing, never negative", () => {
    expect(hoursSince(1_000, 1_000 + 5 * 3_600_000 + 59_999)).toBe(5);
    expect(hoursSince(10_000, 1_000)).toBe(0);
  });
});

describe("snapshots and errors in plain words", () => {
  it("describes how a confirmed income was split from its stored trace", () => {
    expect(doneHow({ job: "plan", planKey: "B" }, ["Tax"])).toBe("Split by Plan B");
    expect(doneHow({ job: "own" }, [])).toBe("Own split");
    expect(doneHow({ job: "whole" }, ["Scholarship"])).toBe("Kept whole in Scholarship");
    expect(doneHow({ job: "one" }, ["Fun money"])).toBe("One-off to Fun money");
    expect(doneHow(null, [])).toBe("Confirmed");
  });

  it("turns database refusals into sentences that say how to fix them", () => {
    expect(confirmErrorText("Needs a job: income x has no job")).toContain("needs a job");
    expect(confirmErrorText("Rent cannot be picked for a one-off income (x)")).toBe("Rent can't be picked for a one-off. Choose another bucket.");
    expect(confirmErrorText('Bucket b has no "kept in" account; set one')).toContain("Set one in Plans");
    expect(confirmErrorText("income not found, not yours")).toContain("Reload");
    expect(confirmErrorText("fetch failed")).toContain("Nothing was changed");
  });
});
