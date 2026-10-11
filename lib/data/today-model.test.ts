import { describe, expect, it } from "vitest";
import { G2_ALLOCS, PLAN_A, PLAN_B, income, planRows, sources } from "./money-in-testkit";
import { BUCKET, G1, G2, TODAY, allocsOf, flowsOf, g9, mi, ms, todayBuckets, type Hue } from "./today-testkit";
import {
  SHELF_MIN_SCALE,
  bucketOnShelf,
  buildTodayView,
  coverMessage,
  coverOffer,
  daysUntilPayday,
  daysUntilText,
  nextReviewIso,
  setAsideHint,
  shelfScale,
  weekRangeLabel,
  type BucketFlow,
  type TodayBucket,
  type TodayInput,
} from "./today-model";

const slot = (v: ReturnType<typeof buildTodayView>, hue: Hue) => v.shelf?.groups.flatMap((g) => g.slots).find((s) => s.id === BUCKET[hue]);

describe("G9: the prototype's starting state (BR §10)", () => {
  const v = buildTodayView(g9());

  it("Living is −₱86.97 and shown as Needs ₱86.97; Fun has ₱432.40", () => {
    const living = slot(v, "living");
    const fun = slot(v, "fun");
    expect(living?.leftMinor).toBe(-8697);
    expect(living?.needsMinor).toBe(8697);
    expect(living?.tag).toEqual({ kind: "needs", text: "Needs ₱86.97" });
    expect(living?.ribbonBp).toBe(0); // overspent: no ribbon
    expect(fun?.leftMinor).toBe(43_240);
    expect(fun?.ribbonBp).toBeGreaterThan(0);
  });

  it("safe to spend is ₱345.43, per day over 10 days is 3454 centavos, shown as the whole-peso floor ₱34 (P-2)", () => {
    expect(v.safe?.safeMinor).toBe(34_543);
    expect(v.safe?.daysUntilPayday).toBe(10);
    expect(v.safe?.perDayMinor).toBe(3454);
    expect(v.safe?.perDayText).toBe("About ₱34 a day for 10 days");
    expect(v.daysText).toBe("10 days until payday");
    expect(v.safe?.caption).toBe("Living and Fun money, until your next payday.");
  });

  it("the day strip has one cell per day and ends in Pay", () => {
    expect(v.safe?.strip).toHaveLength(10);
    expect(v.safe?.strip.at(-1)).toEqual({ label: "Pay", pay: true });
    // Oct 12 is a Monday
    expect(v.safe?.strip[0]?.label).toBe("M");
  });

  it("leaders: put away this month and set aside for tax come from this month's allocations", () => {
    expect(v.safe?.putAwayMinor).toBe(554_528 + 519_870 + 173_290);
    expect(v.safe?.month).toBe("October");
    expect(v.safe?.taxMinor).toBe(103_974);
  });

  it("the next step is Cover from Buffer + See what happened, naming what Living needs", () => {
    expect(v.next.kind).toBe("living");
    expect(v.next.heading).toBe("Living needs ₱86.97");
    expect(v.next.cover).toMatchObject({ toBucketId: BUCKET.living, coverMinor: 8697, stillNeededMinor: 0, bufferLeftMinor: 86_645 });
    expect(v.next.body).toBe("Cover it from Buffer and Living is back to zero. Buffer keeps ₱779.48.");
  });

  it("the week reads 3 of 5 done with Living above zero still open", () => {
    expect(v.week.title).toBe("This week");
    expect(v.week.doneCount).toBe(3);
    expect(v.week.steps.map((s) => [s.id, s.done])).toEqual([
      ["payday", true],
      ["assign", true],
      ["move", true],
      ["living", false],
      ["review", false],
    ]);
  });

  it("the drawer for Living offers the cover and the slip reconciles to Left", () => {
    const d = v.drawers[BUCKET.living];
    expect(d?.leftMinor).toBe(-8697);
    expect(d?.needsMinor).toBe(8697);
    expect(d?.cover?.coverMinor).toBe(8697);
    expect(d?.lines.reduce((t, l) => t + l.amountMinor, 0)).toBe(-8697);
    expect(d?.lines.map((l) => l.kind)).toEqual(["in", "out"]);
    expect(d?.lines[0]?.label).toBe("Oct 7 Work");
    expect(d?.lines[1]?.label).toBe("Oct 8 Groceries");
    expect(d?.keptIn).toBe("GCash / cash");
    expect(d?.planText).toBe("7% of each payday on Plan A, 7% on Plan B.");
  });
});

describe("G10: Emergency at 554528, then G2 confirmed (BR §10)", () => {
  // G1 is a Work payday on Oct 7; G2 (Others, given the plan job) landed Oct 8 and was confirmed today.
  const v = buildTodayView(
    g9({
      flows: flowsOf({ ...Object.fromEntries((Object.keys(G1) as Hue[]).map((h) => [h, G1[h] + G2[h]])) } as Record<Hue, number>),
      allocations: [...allocsOf("g1", "work", G1, 7, 7), ...allocsOf("g2", "others", G2, 8, TODAY)],
      spendingThisMonth: [],
    }),
  );
  const em = v.goals.cards[0];

  it("Emergency is ₱12,905.28, 25.8% of ₱50,000, and passed 25% today", () => {
    expect(em?.savedMinor).toBe(1_290_528);
    expect(em?.progressBp).toBe(2581);
    expect(em?.percent).toBe(25);
    expect(em?.prevProgressBp).toBe(1109); // 554528 / 5000000
    expect(em?.passedToday).toBe(25);
    expect(em?.hitTicks).toEqual([25]);
    expect(em?.main).toBe(true);
  });

  it("says About 7 more paydays like Oct 7 (the last Work payday, not the Others one)", () => {
    expect(em?.toGoMinor).toBe(3_709_472);
    expect(em?.tail).toBe("About 7 more paydays like Oct 7, then Plan B starts.");
  });

  it("does not say Passed 25% today when nothing was confirmed today", () => {
    const old = buildTodayView(g9({ flows: flowsOf({ emergency: 1_290_528 }), allocations: [...allocsOf("g1", "work", G1, 7, 7), ...allocsOf("g2", "others", G2, 8, 9)] }));
    expect(old.goals.cards[0]?.passedToday).toBeNull();
  });

  it("a confirm that doesn't cross a tick shows no chip", () => {
    const small = buildTodayView(g9({ flows: flowsOf({ emergency: 1_000_000 }), allocations: allocsOf("g3", "work", { ...G1, emergency: 100_000 }, 8, TODAY) }));
    expect(small.goals.cards[0]?.passedToday).toBeNull();
  });
});

describe("days until payday (D-15)", () => {
  it("counts calendar days and hides what it can't know", () => {
    expect(daysUntilPayday("2026-10-11", "2026-10-21")).toBe(10);
    expect(daysUntilPayday("2026-10-11", "2026-10-11")).toBe(0);
    expect(daysUntilPayday("2026-10-11", "2026-10-10")).toBeNull(); // stale
    expect(daysUntilPayday("2026-10-11", null)).toBeNull();
    expect(daysUntilPayday("2026-10-11", "not a date")).toBeNull();
    expect(daysUntilText(null)).toBeNull();
    expect(daysUntilText(1)).toBe("1 day until payday");
    expect(daysUntilText(0)).toBe("Payday is today");
  });

  it("with no payday date the days text and per-day line are gone, but safe to spend stays", () => {
    const v = buildTodayView(g9({ profile: { ...g9().profile, nextPaydayDate: null } }));
    expect(v.daysText).toBeNull();
    expect(v.safe?.safeMinor).toBe(34_543);
    expect(v.safe?.perDayText).toBeNull();
    expect(v.safe?.perDayMinor).toBeNull();
    expect(v.safe?.strip).toEqual([]);
    expect(v.safe?.caption).toBe("Living and Fun money.");
  });

  it("per-day is never below 0 when safe is negative, and the number itself stays negative and honest", () => {
    const v = buildTodayView(g9({ flows: flowsOf(G1, { living: 130_000, fun: 300_000 }) }));
    expect(v.safe?.safeMinor).toBe(121_303 + 173_290 - 430_000);
    expect(v.safe?.safeMinor).toBeLessThan(0);
    expect(v.safe?.perDayMinor).toBe(0);
    expect(v.safe?.perDayText).toBe("About ₱0 a day for 10 days");
  });

  it("on payday the whole safe amount is for today", () => {
    const v = buildTodayView(g9({ profile: { ...g9().profile, nextPaydayDate: "2026-10-11" } }));
    expect(v.safe?.perDayMinor).toBe(34_543);
    expect(v.safe?.perDayText).toBe("About ₱345 for today");
    expect(v.safe?.strip).toEqual([{ label: "Pay", pay: true }]);
  });
});

describe("shelf", () => {
  it("draws to one scale that grows in ₱2,000 steps from the ₱14,000 floor", () => {
    expect(shelfScale(0)).toBe(SHELF_MIN_SCALE);
    expect(shelfScale(1_400_000)).toBe(1_400_000);
    expect(shelfScale(1_400_001)).toBe(1_600_000);
    expect(shelfScale(1_290_528 + 736_000)).toBe(2_200_000);
    const v = buildTodayView(g9());
    expect(v.shelf?.scaleMinor).toBe(1_400_000);
    // Emergency ₱5,545.28 of ₱14,000 = 39.6%
    expect(slot(v, "emergency")?.ribbonBp).toBe(3960);
    expect(v.shelf?.totalMinor).toBe(1_732_900 - 130_000 - 130_050);
  });

  it("groups: three, named, and the Set aside hint says what is actually there", () => {
    const v = buildTodayView(g9());
    expect(v.shelf?.groups.map((g) => g.key)).toEqual(["spend", "save", "set_aside"]);
    expect(v.shelf?.groups[2]?.hint).toBe("bills & cushions");
    expect(setAsideHint([{ hue: "buffer", planless: false }])).toBe("cushions");
    expect(setAsideHint([{ hue: "tax", planless: false }, { hue: "buffer", planless: false }, { hue: "dost", planless: true }])).toBe("bills, cushions & scholarship");
    expect(setAsideHint([])).toBe("");
  });

  it("Rent starts Jan 2027 while it is 0; Scholarship is hidden until a source keeps money there", () => {
    const v = buildTodayView(g9());
    expect(slot(v, "rent")?.tag).toEqual({ kind: "starts", text: "Starts Jan 2027. Until then it goes to Emergency fund." });
    expect(slot(v, "dost")).toBeUndefined();
    const withScholarship = buildTodayView(g9({ sources: [...sources, { ...sources[0]!, id: "dost-src", name: "DOST stipend", kind: "scholarship", rule: "whole", wholeBucketId: BUCKET.dost }] }));
    expect(slot(withScholarship, "dost")?.tag?.kind).toBe("planless");
  });

  it("rent loses the Starts tag once its date has come", () => {
    const v = buildTodayView(g9({ todayIso: "2027-01-02" }));
    expect(slot(v, "rent")?.tag).toBeNull();
  });

  it("visibility rules: plan share, source keeps money, or it holds/spent money; groups with nothing are hidden", () => {
    const plan = { planA: [{ bucketId: BUCKET.living, bp: 10_000 }], planB: [], switchOn: false };
    const noFlow: BucketFlow = { allocated: 0, spent: 0, coversIn: 0, coversOut: 0, left: 0 };
    const b = (hue: Hue): TodayBucket => todayBuckets.find((x) => x.id === BUCKET[hue]) as TodayBucket;
    expect(bucketOnShelf(b("living"), noFlow, plan, [])).toBe(true);
    expect(bucketOnShelf(b("fun"), noFlow, plan, [])).toBe(false);
    expect(bucketOnShelf(b("fun"), { ...noFlow, spent: 100, left: -100 }, plan, [])).toBe(true);
    expect(bucketOnShelf(b("fun"), noFlow, plan, [{ ...sources[0]!, rule: "whole", wholeBucketId: BUCKET.fun }])).toBe(true);
    expect(bucketOnShelf({ ...b("fun"), isArchived: true }, noFlow, plan, [])).toBe(false);
    // Plan B counts only while the switch is on
    expect(bucketOnShelf(b("fun"), noFlow, { ...plan, planB: [{ bucketId: BUCKET.fun, bp: 500 }], switchOn: true }, [])).toBe(true);
    const onlyLiving = buildTodayView(g9({ plan: { ...mi.plan, planA: [{ bucketId: BUCKET.living, bp: 10_000 }], planB: [], switchOn: false }, flows: flowsOf({}), allocations: [], sources: [] }));
    expect(onlyLiving.shelf?.groups.map((g) => g.key)).toEqual(["spend"]);
    expect(onlyLiving.safe?.caption).toBe("Living money, until your next payday.");
  });

  it("with no buckets there is no shelf and no safe to spend, only honest empty states", () => {
    const v = buildTodayView(g9({ buckets: [], flows: {}, allocations: [], goals: [] }));
    expect(v.shelf).toBeNull();
    expect(v.safe).toBeNull();
    expect(v.goals.cards).toEqual([]);
    expect(v.next.kind).toBe("pay");
  });

  it("waiting income shows as dashed previews, and jobless income is previewed as the active plan and says so", () => {
    const waiting = [income("w-side", "side", 350_000, 9, { accountId: "gcash" }), income("w-gift", "ask", 5_000, 10)];
    const v = buildTodayView(g9({ incomes: waiting }));
    // Side hustle own split: Tax 10%. Gift (ask) as Plan A: Tax 6% of ₱50 = ₱3.
    expect(slot(v, "tax")?.pendingAddMinor).toBe(35_000 + 300);
    expect(slot(v, "sinking")?.pendingAddMinor).toBe(140_000 + 500);
    expect(v.shelf?.preview).toEqual({ totalMinor: 355_000, note: "Gift shown as Plan A" });
    expect(slot(v, "tax")?.pendingBp).toBeGreaterThan(0);
  });

  it("no waiting income, no preview", () => {
    expect(buildTodayView(g9()).shelf?.preview).toBeNull();
    expect(slot(buildTodayView(g9()), "tax")?.pendingAddMinor).toBe(0);
  });

  it("an overspent bucket that waiting income would lift shows the dashed preview but still no ribbon", () => {
    const v = buildTodayView(g9({ incomes: [income("w", "work", 200_000, 10)] }));
    const living = slot(v, "living");
    expect(living?.ribbonBp).toBe(0);
    expect(living?.tag?.kind).toBe("needs");
    expect(living?.pendingAddMinor).toBe(14_000);
    expect(living?.pendingBp).toBeGreaterThan(0);
  });
});

describe("next step (SPEC §1, BR §8, §12.6)", () => {
  const clean = (o: Partial<TodayInput> = {}) => g9({ flows: flowsOf(G1, { living: 100_000 }), ...o });

  it("waiting income comes first and names who still needs a job", () => {
    const v = buildTodayView(clean({ incomes: [income("a", "work", 100_000, 9), income("b", "ask", 5_000, 10)] }));
    expect(v.next.kind).toBe("assign");
    expect(v.next.cta).toEqual({ label: "Give them a job", href: "/money-in" });
    expect(v.next.body).toBe("1 already knows their job. Gift needs you to pick one.");
    expect(v.next.chips).toEqual([
      { id: "a", name: "Work", amountMinor: 100_000, needsJob: false },
      { id: "b", name: "Gift", amountMinor: 5_000, needsJob: true },
    ]);
    expect(v.next.heading).toBe("₱1,050 from 2 incomes is waiting for a job");
  });

  it("one waiting income reads 'Give it a job' and names the amount and source", () => {
    const v = buildTodayView(clean({ incomes: [income("a", "work", 100_000, 9)] }));
    expect(v.next.cta?.label).toBe("Give it a job");
    expect(v.next.heading).toBe("₱1,000.00 from Work is waiting");
    expect(v.next.body).toBe("Each source already has a rule, so this takes about a minute: check, confirm, done.");
  });

  it("waiting income beats Living below zero", () => {
    expect(buildTodayView(g9({ incomes: [income("a", "work", 100_000, 9)] })).next.kind).toBe("assign");
  });

  it("open transfers → Make transfers, with the amount still to send", () => {
    const rows = planRows(G2_ALLOCS).filter((r) => r.kind === "transfer");
    const v = buildTodayView(clean({ transferPlan: rows }));
    expect(v.next.kind).toBe("move");
    expect(v.next.cta).toEqual({ label: "Make transfers", href: "/money-in" });
    const total = rows.reduce((t, r) => t + r.sendMore, 0);
    expect(v.next.heading).toBe(`Send ₱${(total / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} to ${new Set(rows.map((r) => r.toAccountId)).size} accounts`);
    expect(v.week.steps.find((s) => s.id === "move")?.done).toBe(false);
  });

  it("transfers come before Living below zero", () => {
    const rows = planRows(G2_ALLOCS).filter((r) => r.kind === "transfer");
    expect(buildTodayView(g9({ transferPlan: rows })).next.kind).toBe("move");
  });

  it("Buffer can't cover all of it: names the part it can and the rest", () => {
    const v = buildTodayView(g9({ flows: flowsOf({ ...G1, buffer: 5000 }, { living: 130_000 + 8697 - 5000 + 20_000 }) }));
    const living = v.shelf?.groups[0]?.slots.find((s) => s.id === BUCKET.living);
    expect(living?.needsMinor).toBeGreaterThan(5000);
    expect(v.next.kind).toBe("living");
    expect(v.next.cover?.coverMinor).toBe(5000);
    expect(v.next.cover?.stillNeededMinor).toBe((living?.needsMinor ?? 0) - 5000);
    expect(v.next.body).toContain("would still be needed");
  });

  it("Buffer empty: no cover button, says so", () => {
    const v = buildTodayView(g9({ flows: flowsOf({ ...G1, buffer: 0 }, { living: 130_000 }) }));
    expect(v.next.kind).toBe("living");
    expect(v.next.cover).toBeNull();
    expect(v.next.body).toContain("nothing left to cover with");
  });

  it("everything fine → Start review", () => {
    const v = buildTodayView(clean());
    expect(v.next.kind).toBe("review");
    expect(v.next.heading).toBe("Close the week");
    expect(v.next.cta).toEqual({ label: "Start review", href: "/review" });
    expect(v.next.body).toBe("Look back at Oct 5 to 11, then start Monday fresh.");
  });

  it("all done → 'Every peso has a job this week.' with the next review and payday", () => {
    const v = buildTodayView(clean({ weekClosed: true }));
    expect(v.next.kind).toBe("done");
    expect(v.next.heading).toBe("Every peso has a job this week.");
    expect(v.next.body).toBe("Next review is Sunday, Oct 18. Your next payday is Oct 21.");
    expect(v.week.doneCount).toBe(5);
    expect(v.next.cta).toBeNull();
  });

  it("all done with no payday date leaves the payday out", () => {
    const v = buildTodayView(clean({ weekClosed: true, profile: { ...g9().profile, nextPaydayDate: null } }));
    expect(v.next.body).toBe("Next review is Sunday, Oct 18.");
  });

  it("nothing ever confirmed → add income (not 'Make transfers' for nothing)", () => {
    const v = buildTodayView(g9({ flows: flowsOf({}), allocations: [], spendingThisMonth: [], goals: [] }));
    expect(v.next.kind).toBe("pay");
    expect(v.next.cta).toEqual({ label: "+ Add income", href: "/money-in?add=1" });
    expect(v.week.doneCount).toBe(2); // all money in has a job (nothing waits) and Living is not below zero
  });

  it("exactly one primary action source: the card has either a cta or the cover/see-what-happened pair, never both", () => {
    for (const input of [g9(), g9({ incomes: [income("a", "work", 1, 9)] }), g9({ weekClosed: true, flows: flowsOf(G1, {}) })]) {
      const v = buildTodayView(input);
      expect(Boolean(v.next.cta) && v.next.kind === "living").toBe(false);
    }
  });
});

describe("Getting started (BR §12.6)", () => {
  const first = (o: Partial<TodayInput> = {}) => g9({ profile: { ...g9().profile, onboardedAt: ms(5) }, flows: flowsOf({}), allocations: [], spendingThisMonth: [], ...o });

  it("reads Getting started with the with-plan steps until the first week is closed", () => {
    const v = buildTodayView(first());
    expect(v.week.title).toBe("Getting started");
    expect(v.week.steps.map((s) => s.label)).toEqual(["Plan set up", "First pay has a job", "Transfers made", "First spending logged", "First week closed"]);
    expect(v.week.doneCount).toBe(1);
    expect(v.next.kind).toBe("pay");
  });

  it("waiting income always takes the card first", () => {
    expect(buildTodayView(first({ incomes: [income("a", "work", 100_000, 9)] })).next.kind).toBe("assign");
  });

  it("then the first unfinished step: log spending after a confirmed pay", () => {
    const v = buildTodayView(first({ flows: flowsOf(G1), allocations: allocsOf("g1", "work", G1, 7, 7) }));
    expect(v.week.steps.map((s) => s.done)).toEqual([true, true, true, false, false]);
    expect(v.next.kind).toBe("log");
    expect(v.next.cta).toBeNull();
  });

  it("just tracking has its own steps and asks for a plan", () => {
    const v = buildTodayView(first({ profile: { ...g9().profile, onboardedAt: ms(5), planMode: "track" }, plan: { ...mi.plan, planA: [{ bucketId: BUCKET.living, bp: 10_000 }] } }));
    expect(v.week.steps.map((s) => s.label)).toEqual(["Income and accounts set up", "Make a plan", "First pay recorded", "First spending logged", "First week closed"]);
    expect(v.next.kind).toBe("make_plan");
  });

  it("goes back to This week once any week has been closed", () => {
    expect(buildTodayView(first({ anyWeekClosed: true })).week.title).toBe("This week");
  });

  it("an expense after onboarding ticks First spending logged", () => {
    const v = buildTodayView(first({ flows: flowsOf(G1), allocations: allocsOf("g1", "work", G1, 7, 7), spendingLoggedAfterOnboarding: true }));
    expect(v.week.steps.find((s) => s.id === "log")?.done).toBe(true);
    expect(v.next.kind).toBe("review");
    expect(v.next.heading).toBe("Close your first week");
  });
});

describe("last payday split needs a real Work payday this week (BR §8.1)", () => {
  it("ticks for a salary payday dated or confirmed this week, not for Others or last week's", () => {
    const step = (i: TodayInput) => buildTodayView(i).week.steps.find((s) => s.id === "payday")?.done;
    expect(step(g9())).toBe(true);
    expect(step(g9({ allocations: allocsOf("g2", "others", G2, 7, 7) }))).toBe(false);
    expect(step(g9({ allocations: allocsOf("g1", "work", G1, 1, 1) }))).toBe(false);
    expect(step(g9({ allocations: allocsOf("g1", "work", G1, 1, 8) }))).toBe(true);
  });
});

describe("goals (BR §7)", () => {
  const more = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `g${i}`, name: `Goal ${i}`, targetMinor: 1_000_000, currency: "PHP", linkedBucketId: BUCKET.sinking, linkedShareBp: 5000, isPlanSwitch: false }));

  it("no goals → no cards (the page shows one inviting line)", () => {
    expect(buildTodayView(g9({ goals: [] })).goals).toEqual({ cards: [], moreNames: [] });
  });

  it("shows at most three, Emergency first even if it was created last, and names the rest", () => {
    const em = g9().goals[0]!;
    const v = buildTodayView(g9({ goals: [...more(4), em] }));
    expect(v.goals.cards.map((c) => c.name)).toEqual(["Emergency fund", "Goal 0", "Goal 1"]);
    expect(v.goals.moreNames).toEqual(["Goal 2", "Goal 3"]);
  });

  it("other goals show their feed, not paydays-to-go", () => {
    const v = buildTodayView(g9({ goals: more(1) }));
    expect(v.goals.cards[0]?.tail).toBe("Fed from 50% of Sinking funds");
    expect(v.goals.cards[0]?.savedMinor).toBe(86_645);
    expect(v.goals.cards[0]?.main).toBe(false);
  });

  it("hides 'About N more paydays' until there is a Work payday", () => {
    const v = buildTodayView(g9({ allocations: allocsOf("g2", "others", G2, 8, 8) }));
    expect(v.goals.cards[0]?.tail).toBe("");
  });

  it("target reached says so and that Plan B is active", () => {
    const v = buildTodayView(g9({ activePlan: "B", flows: flowsOf({ emergency: 5_000_000 }) }));
    expect(v.goals.cards[0]).toMatchObject({ reached: true, progressBp: 10_000, percent: 100, toGoMinor: 0, tail: "Target reached. Plan B is active." });
  });

  it("an unreachable 25/50/75 tick stays unlit; hit ticks light", () => {
    const v = buildTodayView(g9({ flows: flowsOf({ emergency: 2_600_000 }) }));
    expect(v.goals.cards[0]?.hitTicks).toEqual([25, 50]);
  });
});

describe("drawer (SPEC §1)", () => {
  it("Rent says where its share goes until the start date; Scholarship isn't part of the split", () => {
    const v = buildTodayView(g9());
    expect(v.drawers[BUCKET.rent]?.planText).toBe("2% of each payday on Plan A, 2% on Plan B. Until Jan 2027 this share goes to the Emergency fund.");
    expect(v.drawers[BUCKET.dost]?.planText).toBe("Not part of the payday split.");
    expect(v.drawers[BUCKET.emergency]?.planText).toBe("30% of each payday on Plan A, 10% on Plan B.");
  });

  it("covers show as From Buffer / To Living and the total still reconciles", () => {
    const v = buildTodayView(
      g9({
        flows: flowsOf(G1, { living: 130_000 }, [{ from: "buffer", to: "living", amount: 8697 }]),
        coversThisMonth: [{ fromBucketId: BUCKET.buffer, toBucketId: BUCKET.living, dateIso: "2026-10-10", amountMinor: 8697 }],
      }),
    );
    const living = v.drawers[BUCKET.living]!;
    expect(living.lines.map((l) => l.label)).toEqual(["Oct 7 Work", "Oct 8 Groceries", "Oct 10 From Buffer"]);
    expect(living.lines.reduce((t, l) => t + l.amountMinor, 0)).toBe(living.leftMinor);
    expect(living.leftMinor).toBe(0);
    expect(living.cover).toBeNull();
    const buffer = v.drawers[BUCKET.buffer]!;
    expect(buffer.lines.at(-1)).toMatchObject({ kind: "cover_out", label: "Oct 10 To Living", amountMinor: -8697 });
    expect(buffer.cover).toBeNull();
  });

  it("money from earlier months shows as a 'Before October' line so the slip adds up", () => {
    const v = buildTodayView(g9({ allocations: [], flows: flowsOf({ living: 50_000 }), spendingThisMonth: [] }));
    expect(v.drawers[BUCKET.living]?.lines).toEqual([{ kind: "before", label: "Before October", amountMinor: 50_000 }]);
  });

  it("a quiet bucket says nothing came in or went out", () => {
    const v = buildTodayView(g9({ allocations: [], flows: flowsOf({}), spendingThisMonth: [] }));
    expect(v.drawers[BUCKET.fun]?.lines).toEqual([]);
  });
});

describe("cover from Buffer (BR §4.3, D-19)", () => {
  const inp = g9();
  it("offers min(deficit, Buffer) and names the rest", () => {
    expect(coverOffer(inp, BUCKET.living)).toMatchObject({ needsMinor: 8697, coverMinor: 8697, stillNeededMinor: 0 });
    const short = coverOffer({ buckets: inp.buckets, flows: flowsOf({ ...G1, buffer: 3000 }, { living: 130_000 }) }, BUCKET.living);
    expect(short).toMatchObject({ coverMinor: 3000, stillNeededMinor: 5697 });
  });

  it("offers nothing for a bucket that isn't below zero, for Buffer itself, or without a Buffer bucket", () => {
    expect(coverOffer(inp, BUCKET.fun)).toBeNull();
    expect(coverOffer(inp, BUCKET.buffer)).toBeNull();
    expect(coverOffer({ buckets: inp.buckets.filter((b) => b.hue !== "buffer"), flows: inp.flows }, BUCKET.living)).toBeNull();
  });

  it("the words after Cover: full, partial, nothing to cover with, already fine", () => {
    const c = { toName: "Living", fromName: "Buffer" };
    expect(coverMessage(c, { coveredMinor: 8697, stillNeedsMinor: 0 })).toEqual({ tone: "good", text: "Covered. Buffer topped up Living by ₱86.97." });
    expect(coverMessage(c, { coveredMinor: 3000, stillNeedsMinor: 5697 }).tone).toBe("warm");
    expect(coverMessage(c, { coveredMinor: 3000, stillNeedsMinor: 5697 }).text).toContain("Living still needs ₱56.97");
    expect(coverMessage(c, { coveredMinor: 0, stillNeedsMinor: 8697 }).text).toBe("Buffer has nothing left to cover with. Living still needs ₱86.97.");
    expect(coverMessage(c, { coveredMinor: 0, stillNeedsMinor: 0 }).text).toBe("Living isn't below zero any more.");
  });
});

describe("dates", () => {
  it("week range label", () => {
    expect(weekRangeLabel("2026-10-05", "2026-10-12")).toBe("Oct 5 to 11");
    expect(weekRangeLabel("2026-09-28", "2026-10-05")).toBe("Sep 28 to Oct 4");
  });
  it("next review lands on the review day on or after the next week's start", () => {
    expect(nextReviewIso("2026-10-12", 0)).toBe("2026-10-18"); // Sunday
    expect(nextReviewIso("2026-10-12", 1)).toBe("2026-10-12"); // Monday
    expect(nextReviewIso("2026-10-12", 5)).toBe("2026-10-16"); // Friday
  });
});

describe("plans are read as given", () => {
  it("uses Plan B percentages only when the switch is on", () => {
    expect(PLAN_A.length).toBe(PLAN_B.length);
    const off = buildTodayView(g9({ plan: { ...mi.plan, switchOn: false } }));
    expect(off.drawers[BUCKET.emergency]?.planText).toBe("30% of each payday on Plan A.");
  });
});
