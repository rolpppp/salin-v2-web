import { describe, expect, it } from "vitest";
import {
  buildWeekSlip,
  closedSummary,
  coverMessage,
  emergencyProgress,
  formatLongDate,
  formatStampDate,
  formatWeekRange,
  nextReviewDate,
  nudgeMessage,
  openItemsCount,
  pickObservation,
  reviewChecks,
  reviewSteps,
  slipFooter,
  slipRole,
  spendSummary,
  weekStartOf,
  weekdayOf,
  type ReviewBucket,
  type ReviewData,
} from "./review-model";

const bucket = (hue: string, groupKey: string, over: Partial<ReviewBucket> = {}): ReviewBucket => ({
  id: `id-${hue}`,
  name: hue === "emergency" ? "Emergency fund" : hue === "fun" ? "Fun money" : hue[0].toUpperCase() + hue.slice(1),
  shortName: null,
  groupKey,
  hue,
  isArchived: false,
  leftMinor: 0,
  spentWeekMinor: 0,
  coversInWeekMinor: 0,
  changeWeekMinor: 0,
  changeLastWeekMinor: 0,
  ...over,
});

const base = (buckets: ReviewBucket[], over: Partial<ReviewData> = {}): ReviewData => ({
  firstName: "Maria",
  weekStart: "2026-10-05",
  weekEnd: "2026-10-11",
  weekStartsOn: 1,
  reviewDay: 0,
  todayIso: "2026-10-11",
  buckets,
  categories: [],
  sources: [],
  cameInWeekMinor: 0,
  carriedInMinor: 0,
  spentWeekMinor: 0,
  toAssignMinor: 0,
  hasHistory: false,
  waitingCount: 0,
  anyConfirmed: true,
  pendingTransfers: 0,
  livingPlanBp: 700,
  emergency: { bucketId: "id-emergency", savedMinor: 0, targetMinor: 5_000_000 },
  closed: null,
  ...over,
});

describe("slipRole", () => {
  it("maps groups and hues to the slip lines (BR 8.3)", () => {
    expect(slipRole({ groupKey: "spend", hue: "living" })).toBe("spend");
    expect(slipRole({ groupKey: "save", hue: "emergency" })).toBe("save");
    expect(slipRole({ groupKey: "set_aside", hue: "tax" })).toBe("tax");
    for (const hue of ["buffer", "dost", "rent", null]) expect(slipRole({ groupKey: "set_aside", hue })).toBe("cushion");
  });
});

describe("week slip reconciliation (BR 8.3)", () => {
  // Plan A split of ₱23,000 (G2) landed this week; ₱10,000 carried in from earlier weeks.
  const g2 = { tax: 138_000, living: 161_000, emergency: 736_000, invest: 690_000, sinking: 230_000, fun: 230_000, buffer: 115_000 };

  it("holds with spending from a set-aside (BIR payment from Tax) and a cover from Buffer", () => {
    // Everything in g2 landed this week; 1,000,000 carried in from before (earlier income - earlier spending).
    // This week: Living spends 200,000 (overspent by 39,000), BIR paid 30,000 FROM TAX, Buffer covers Living 39,000.
    const living = g2.living - 200_000 + 39_000; // 0
    const tax = g2.tax - 30_000; // 108,000
    const buffer = g2.buffer - 39_000; // 76,000
    const buckets = [
      bucket("tax", "set_aside", { leftMinor: tax }),
      bucket("living", "spend", { leftMinor: living }),
      bucket("emergency", "save", { leftMinor: g2.emergency + 600_000 }),
      bucket("invest", "save", { leftMinor: g2.invest + 400_000 }),
      bucket("sinking", "save", { leftMinor: g2.sinking }),
      bucket("fun", "spend", { leftMinor: g2.fun }),
      bucket("buffer", "set_aside", { leftMinor: buffer }),
    ];
    const cameInWeek = 2_300_000;
    const carriedIn = 1_000_000; // earlier income 1,000,000 with nothing spent before
    const spent = 230_000; // 200,000 Living + 30,000 BIR
    const v = buildWeekSlip(base(buckets, { cameInWeekMinor: cameInWeek, carriedInMinor: carriedIn, spentWeekMinor: spent, toAssignMinor: 0 }));
    expect(v.slip.putAway).toBe(g2.emergency + 600_000 + g2.invest + 400_000 + g2.sinking);
    expect(v.slip.taxSetAside).toBe(108_000);
    expect(v.slip.cushionsAndKeptWhole).toBe(76_000);
    expect(v.slip.safeToSpend).toBe(g2.fun);
    expect(v.slip.cameIn).toBe(3_300_000);
    expect(v.slip.difference).toBe(0);
    expect(v.slip.reconciles).toBe(true);
  });

  it("a cover moves money between buckets and changes no total", () => {
    const without = buildWeekSlip(base([bucket("living", "spend", { leftMinor: -50_000 }), bucket("buffer", "set_aside", { leftMinor: 300_000 })], { cameInWeekMinor: 250_000, spentWeekMinor: 0 }));
    const withCover = buildWeekSlip(base([bucket("living", "spend", { leftMinor: 0 }), bucket("buffer", "set_aside", { leftMinor: 250_000 })], { cameInWeekMinor: 250_000, spentWeekMinor: 0 }));
    expect(without.slip.reconciles).toBe(true);
    expect(withCover.slip.reconciles).toBe(true);
    expect(without.slip.putAway + without.slip.cushionsAndKeptWhole + without.slip.safeToSpend).toBe(withCover.slip.putAway + withCover.slip.cushionsAndKeptWhole + withCover.slip.safeToSpend);
  });

  it("waiting income is 'To assign' and still reconciles", () => {
    const v = buildWeekSlip(base([bucket("living", "spend", { leftMinor: 100_000 })], { cameInWeekMinor: 150_000, toAssignMinor: 50_000 }));
    expect(v.slip.toAssign).toBe(50_000);
    expect(v.slip.reconciles).toBe(true);
  });

  it("negative carried-in (earlier overspending) still reconciles and shows as is", () => {
    const v = buildWeekSlip(base([bucket("living", "spend", { leftMinor: 40_000 })], { cameInWeekMinor: 100_000, carriedInMinor: -60_000 }));
    expect(v.slip.cameIn).toBe(40_000);
    expect(v.slip.reconciles).toBe(true);
  });

  it("flags a mismatch instead of hiding it", () => {
    const v = buildWeekSlip(base([bucket("living", "spend", { leftMinor: 100_000 })], { cameInWeekMinor: 100_001 }));
    expect(v.slip.reconciles).toBe(false);
    expect(v.slip.difference).toBe(1);
  });
});

describe("slipFooter", () => {
  it("first week: nothing to compare yet", () => {
    expect(slipFooter(base([]))).toMatch(/no earlier week to compare yet/);
  });
  it("compares put away with last week", () => {
    const b = [bucket("emergency", "save", { changeWeekMinor: 500_000, changeLastWeekMinor: 350_000 })];
    expect(slipFooter(base(b, { hasHistory: true }))).toBe("₱1,500.00 more put away than last week.");
    const l = [bucket("emergency", "save", { changeWeekMinor: 100_000, changeLastWeekMinor: 350_000 })];
    expect(slipFooter(base(l, { hasHistory: true }))).toBe("₱2,500.00 less put away than last week.");
    const s = [bucket("emergency", "save", { changeWeekMinor: 100, changeLastWeekMinor: 100 })];
    expect(slipFooter(base(s, { hasHistory: true }))).toMatch(/same amount/);
  });
});

describe("spendSummary", () => {
  it("empty week", () => {
    const s = spendSummary([bucket("living", "spend"), bucket("fun", "spend")]);
    expect(s.empty).toBe(true);
    expect(s.text).toBe("Nothing logged this week. Log spending on your phone and it shows here.");
  });
  it("bars per Spend bucket with what each had, and notes when nothing came from savings", () => {
    const s = spendSummary([
      bucket("living", "spend", { spentWeekMinor: 130_000, leftMinor: -8_697 }),
      bucket("fun", "spend", { spentWeekMinor: 130_050, leftMinor: 43_240 }),
      bucket("emergency", "save"),
    ]);
    expect(s.bars.map((b) => [b.name, b.spentMinor, b.hadMinor])).toEqual([
      ["Living", 130_000, 121_303],
      ["Fun money", 130_050, 173_290],
    ]);
    expect(s.text).toContain("Nothing came from savings or set-asides.");
    expect(s.bars.every((b) => b.spentRatio >= 0 && b.spentRatio <= 1)).toBe(true);
  });
  it("says so when money came out of savings or a set-aside", () => {
    const s = spendSummary([bucket("living", "spend", { spentWeekMinor: 1_000, leftMinor: 5_000 }), bucket("tax", "set_aside", { spentWeekMinor: 30_000 })]);
    expect(s.fromSavingsMinor).toBe(30_000);
    expect(s.text).toContain("₱300.00 came from savings or set-asides (Tax)");
  });
});

describe("pickObservation: exactly one, by priority", () => {
  const cats = [
    { bucketId: "id-living", name: "Groceries", amountMinor: 61_250 },
    { bucketId: "id-living", name: "Load & data", amountMinor: 18_000 },
    { bucketId: "id-fun", name: "Movies", amountMinor: 52_050 },
  ];
  const overspent = [
    bucket("living", "spend", { leftMinor: -8_697, spentWeekMinor: 130_000 }),
    bucket("fun", "spend", { leftMinor: 43_240, spentWeekMinor: 130_050 }),
    bucket("buffer", "set_aside", { leftMinor: 115_000 }),
  ];

  it("1. overspent Spend bucket: names the biggest category, offers Cover from Buffer and the nudge", () => {
    const o = pickObservation(base(overspent, { categories: cats }));
    expect(o.kind).toBe("overspent");
    expect(o.text).toBe("Living ran ₱86.97 short. Groceries was ₱612.50 of the ₱1,300.00 spent.");
    expect(o).toMatchObject({ bucketId: "id-living", canCover: true, canNudge: true });
  });
  it("1. no Buffer left: says so and doesn't offer the cover", () => {
    const o = pickObservation(base([overspent[0], overspent[1], bucket("buffer", "set_aside", { leftMinor: 0 })], { categories: cats }));
    expect(o.canCover).toBe(false);
    expect(o.text).toContain("Buffer has nothing left to cover it.");
    expect(o.canNudge).toBe(true);
  });
  it("1. Fun overspent: cover yes, Fun-to-Living nudge no (it would make it worse)", () => {
    const o = pickObservation(base([bucket("living", "spend", { leftMinor: 5_000 }), bucket("fun", "spend", { leftMinor: -1_000, spentWeekMinor: 9_000 }), bucket("buffer", "set_aside", { leftMinor: 9_000 })]));
    expect(o).toMatchObject({ kind: "overspent", bucketId: "id-fun", canCover: true, canNudge: false });
  });
  it("1. picks the deepest hole when two are overspent", () => {
    const o = pickObservation(base([bucket("living", "spend", { leftMinor: -1_000 }), bucket("fun", "spend", { leftMinor: -9_000 }), bucket("buffer", "set_aside", { leftMinor: 9_000 })]));
    expect(o.bucketId).toBe("id-fun");
  });
  it("1. ignores an overspent save bucket (only Spend buckets count)", () => {
    const o = pickObservation(base([bucket("living", "spend", { leftMinor: 1_000, spentWeekMinor: 100 }), bucket("emergency", "save", { leftMinor: -500 })]));
    expect(o.kind).not.toBe("overspent");
  });

  it("2. covered this week: suggests raising Living by one point", () => {
    const o = pickObservation(
      base([bucket("living", "spend", { leftMinor: 0, spentWeekMinor: 130_000, coversInWeekMinor: 8_697 }), bucket("fun", "spend"), bucket("buffer", "set_aside", { leftMinor: 100_000 })], { categories: cats, livingPlanBp: 700 }),
    );
    expect(o.kind).toBe("covered");
    expect(o.text).toBe("You covered Living from Buffer this week. If groceries stays this high, Living may need 8% of each payday.");
    expect(o).toMatchObject({ canCover: false, canNudge: true });
  });
  it("2. unknown Living share still reads true", () => {
    const o = pickObservation(base([bucket("living", "spend", { coversInWeekMinor: 1 }), bucket("fun", "spend")], { livingPlanBp: null }));
    expect(o.text).toContain("Living may need a bigger share of each payday.");
  });

  it("3. a positive fact: more put away than last week", () => {
    const o = pickObservation(base([bucket("living", "spend", { leftMinor: 1_000, spentWeekMinor: 500 }), bucket("emergency", "save", { changeWeekMinor: 500_000, changeLastWeekMinor: 300_000 })], { hasHistory: true }));
    expect(o.kind).toBe("positive");
    expect(o.text).toBe("You put away ₱5,000.00 this week, more than last week's ₱3,000.00. Nothing to change.");
  });
  it("3. a positive fact: Living stayed above zero, with what is put away", () => {
    const o = pickObservation(base([bucket("living", "spend", { leftMinor: 1_000, spentWeekMinor: 500 }), bucket("emergency", "save", { leftMinor: 250_000 })]));
    expect(o.text).toBe("Living stayed above zero all week. You have ₱2,500.00 put away for future you. Nothing to change.");
    expect(o).toMatchObject({ canCover: false, canNudge: false });
  });
  it("3. never invents a fact: no spending and nothing put away is a quiet 'nothing yet'", () => {
    const o = pickObservation(base([bucket("living", "spend"), bucket("fun", "spend")]));
    expect(o.kind).toBe("quiet");
    expect(o.text).toMatch(/^Nothing to fix yet/);
  });
});

describe("emergencyProgress", () => {
  const b = [bucket("emergency", "save", { id: "e", changeWeekMinor: 736_000 })];
  it("shows this week's change, not the total, and the percent of the Plan B amount (G10)", () => {
    const p = emergencyProgress({ buckets: b, emergency: { bucketId: "e", savedMinor: 1_290_528, targetMinor: 5_000_000 } });
    expect(p.changeMinor).toBe(736_000);
    expect(p.percent).toBe(25);
    expect(p.text).toBe("25% of the ₱50,000 that switches you to Plan B.");
  });
  it("floors, clamps and survives no target", () => {
    expect(emergencyProgress({ buckets: b, emergency: { bucketId: "e", savedMinor: 4_999_999, targetMinor: 5_000_000 } }).percent).toBe(99);
    expect(emergencyProgress({ buckets: b, emergency: { bucketId: "e", savedMinor: 9_000_000, targetMinor: 5_000_000 } }).percent).toBe(100);
    expect(emergencyProgress({ buckets: b, emergency: { bucketId: "e", savedMinor: -5, targetMinor: 5_000_000 } }).percent).toBe(0);
    expect(emergencyProgress({ buckets: b, emergency: { bucketId: "e", savedMinor: 1, targetMinor: null } })).toMatchObject({ percent: null, targetMinor: null });
  });
  it("no Emergency bucket: change 0", () => {
    expect(emergencyProgress({ buckets: [], emergency: { bucketId: null, savedMinor: 0, targetMinor: 5_000_000 } }).changeMinor).toBe(0);
  });
});

describe("reviewChecks (mirrors close_week)", () => {
  const ok = { waitingCount: 0, anyConfirmed: true, pendingTransfers: 0, buckets: [bucket("living", "spend", { leftMinor: 0 })] };
  it("all pass", () => expect(reviewChecks(ok).map((c) => c.on)).toEqual([true, true, true]));
  it("waiting income fails 'job' and 'transfers'", () => expect(reviewChecks({ ...ok, waitingCount: 2 }).map((c) => c.on)).toEqual([false, false, true]));
  it("an open transfer fails only 'transfers'", () => expect(reviewChecks({ ...ok, pendingTransfers: 1 }).map((c) => c.on)).toEqual([true, false, true]));
  it("no confirmed payday yet fails 'transfers'", () => expect(reviewChecks({ ...ok, anyConfirmed: false }).map((c) => c.on)).toEqual([true, false, true]));
  it("Living below zero fails only 'Living above zero'", () => {
    const c = reviewChecks({ ...ok, buckets: [bucket("living", "spend", { leftMinor: -1 })] });
    expect(c.map((x) => x.on)).toEqual([true, true, false]);
    expect(openItemsCount(c)).toBe(1);
  });
});

describe("stepper", () => {
  it("Fix one thing is open while a Spend bucket is overspent, done once closed", () => {
    expect(reviewSteps({ kind: "overspent" }, false).map((s) => s.done)).toEqual([true, false, false]);
    expect(reviewSteps({ kind: "positive" }, false).map((s) => s.done)).toEqual([true, true, false]);
    expect(reviewSteps({ kind: "overspent" }, true).map((s) => s.done)).toEqual([true, true, true]);
  });
});

describe("dates", () => {
  it("weekday, week range, long date, stamp date", () => {
    expect(weekdayOf("2026-10-11")).toBe(0);
    expect(weekdayOf("2026-10-12")).toBe(1);
    expect(formatWeekRange("2026-10-05", "2026-10-11")).toBe("Oct 5 – 11");
    expect(formatWeekRange("2026-09-28", "2026-10-04")).toBe("Sep 28 – Oct 4");
    expect(formatLongDate("2026-10-18")).toBe("Sunday, October 18");
    expect(formatStampDate("2026-10-11")).toBe("OCT 11");
  });
  it("next review: the first review day on or after next week's start", () => {
    expect(nextReviewDate("2026-10-05", 0)).toBe("2026-10-18"); // Monday week, Sunday review
    expect(nextReviewDate("2026-10-05", 3)).toBe("2026-10-14"); // Wednesday
    expect(nextReviewDate("2026-10-04", 0)).toBe("2026-10-11"); // Sunday week, Sunday review: its own first day
  });
  it("week start from today", () => {
    expect(weekStartOf("2026-10-11", 1)).toBe("2026-10-05");
    expect(weekStartOf("2026-10-11", 0)).toBe("2026-10-11");
    expect(weekStartOf("2026-10-12", 1)).toBe("2026-10-12");
  });
});

describe("closedSummary", () => {
  const closed = { checks: { assign: true, transfers: false, living: true }, safeToSpendMinor: 34_543, observation: null, closedDateIso: "2026-10-11" };
  it("uses the real next week start day, marks open items and the safe amount in whole pesos (floored)", () => {
    const s = closedSummary({ weekStart: "2026-10-05", reviewDay: 0, closed });
    expect(s.heading).toBe("Week closed. Monday starts fresh.");
    expect(s.checks.map((c) => [c.label, c.carries])).toEqual([
      ["Every peso has a job", false],
      ["Transfers made", true],
      ["Living above zero", false],
    ]);
    expect(s.openItems).toBe(1);
    expect(s.startNext).toBe("You start next week with ₱345 safe to spend");
    expect(s.nextReview).toBe("Next review: Sunday, October 18.");
  });
  it("a Sunday-start week says Sunday", () => {
    expect(closedSummary({ weekStart: "2026-10-04", reviewDay: 6, closed }).heading).toBe("Week closed. Sunday starts fresh.");
  });
});

describe("live region sentences", () => {
  it("the nudge says both plans changed", () => {
    const m = nudgeMessage(
      [
        { planKey: "A", fromBp: 1400, toBp: 800 },
        { planKey: "B", fromBp: 900, toBp: 900 },
      ],
      "Fun money",
      "Living",
      100,
    );
    expect(m).toContain("in both plans");
    expect(m).toContain("Plan A: Living 8%, Fun money 14%");
    expect(m).toContain("Plan B: Living 9%, Fun money 9%");
    expect(m).toContain("next payday");
  });
  it("cover: full, partial (names the rest), and nothing", () => {
    expect(coverMessage({ coveredMinor: 8_697, stillNeedsMinor: 0 }, "Living")).toContain("back to zero");
    expect(coverMessage({ coveredMinor: 5_000, stillNeedsMinor: 3_697 }, "Living")).toContain("still needs ₱36.97");
    expect(coverMessage({ coveredMinor: 0, stillNeedsMinor: 100 }, "Living")).toContain("nothing left");
  });
});
