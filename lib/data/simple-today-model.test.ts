import { describe, expect, it } from "vitest";
import { amountBand, buildSimpleToday, keepBucketIdOf, spendingBucketId, type SimpleTodayInput } from "./simple-today-model";

const LIVING = "b-living";
const FUN = "b-fun";
const EMERGENCY = "b-emergency";
const TAX = "b-tax";
const BUCKETS: SimpleTodayInput["buckets"] = [
  { id: LIVING, name: "Living", groupKey: "spend", hue: "living", displayOrder: 1 },
  { id: FUN, name: "Fun", groupKey: "spend", hue: "fun", displayOrder: 2 },
  { id: EMERGENCY, name: "Emergency fund", groupKey: "save", hue: "emergency", displayOrder: 3 },
  { id: TAX, name: "Tax", groupKey: "set_aside", hue: "tax", displayOrder: 4 },
];

/** Thursday 2026-10-15 in Manila, week starting Monday 2026-10-12. */
const manila = (iso: string, hh: number, mm = 0): number => Date.parse(`${iso}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+08:00`);

function input(over: Partial<SimpleTodayInput> = {}): SimpleTodayInput {
  return {
    timeZone: "Asia/Manila",
    todayIso: "2026-10-15",
    weekStartIso: "2026-10-12",
    profile: { firstName: "Rolf", nextPaydayDate: null, spendUntil: null, keepBucketId: null },
    buckets: BUCKETS,
    lefts: { [LIVING]: 100000, [FUN]: 50000, [EMERGENCY]: 300000, [TAX]: 20000 },
    spending: [],
    loggedSpendDays: [],
    noSpendDays: [],
    accounts: [
      { id: "acc-bank", name: "Bank", balanceMinor: 400000 },
      { id: "acc-cash", name: "Cash", balanceMinor: 70000 },
    ],
    transfers: [],
    sources: [{ id: "s-allow", name: "Allowance" }],
    lastSourceId: null,
    lastReceivedInId: null,
    ...over,
  };
}

describe("hero, week and pace", () => {
  it("no spending: spendable is all of Spending, split over the days to the end of the week", () => {
    const m = buildSimpleToday(input());
    expect(m.spendableLeftMinor).toBe(150000);
    expect(m.keptAsideMinor).toBe(320000);
    expect(m.until).toEqual({ day: "2026-10-19", label: "Mon, Oct 19", source: "week-end" });
    expect(m.daysUntil).toBe(4);
    expect(m.paceMinor).toBe(37500);
    expect(m.todayLeftMinor).toBe(37500);
    expect(m.weekLeftMinor).toBe(150000);
  });

  it("spending today in a Spend bucket lowers today, not Kept aside", () => {
    const m = buildSimpleToday(
      input({
        lefts: { [LIVING]: 80000, [FUN]: 50000, [EMERGENCY]: 300000, [TAX]: 20000 },
        spending: [{ bucketId: LIVING, occurredAt: manila("2026-10-15", 9), amountMinor: 20000 }],
      }),
    );
    expect(m.spendableLeftMinor).toBe(130000);
    // dawn: (130000 + 20000) / 4 = 37500; spent 20000
    expect(m.todayLeftMinor).toBe(17500);
    expect(m.paceMinor).toBe(32500);
    expect(m.week[3]).toMatchObject({ state: "today", spentMinor: 20000, leftMinor: 17500 });
  });

  it("spending out of a saving bucket does not touch today's allowance", () => {
    const m = buildSimpleToday(input({ spending: [{ bucketId: EMERGENCY, occurredAt: manila("2026-10-15", 9), amountMinor: 99999 }] }));
    expect(m.todayLeftMinor).toBe(37500);
    expect(m.week[3].spentMinor).toBe(0);
  });

  it("underspending yesterday rolls forward: the same money over fewer days is more per day", () => {
    const mon = buildSimpleToday(input({ todayIso: "2026-10-12", lefts: { [LIVING]: 70000, [FUN]: 0 } }));
    const tue = buildSimpleToday(input({ todayIso: "2026-10-13", lefts: { [LIVING]: 70000, [FUN]: 0 } }));
    expect(mon.paceMinor).toBe(10000);
    expect(tue.paceMinor).toBe(11666);
  });

  it("overspent today is negative and shown as is", () => {
    const m = buildSimpleToday(
      input({
        lefts: { [LIVING]: 10000, [FUN]: 0, [EMERGENCY]: 0, [TAX]: 0 },
        spending: [{ bucketId: LIVING, occurredAt: manila("2026-10-15", 9), amountMinor: 60000 }],
      }),
    );
    expect(m.spendableLeftMinor).toBe(10000);
    expect(m.todayLeftMinor).toBe(Math.floor(70000 / 4) - 60000);
    expect(m.todayLeftMinor).toBeLessThan(0);
  });

  it("all of Spending negative: week left is the shortfall", () => {
    const m = buildSimpleToday(input({ lefts: { [LIVING]: -5000, [FUN]: 0, [EMERGENCY]: 100, [TAX]: 0 } }));
    expect(m.spendableLeftMinor).toBe(-5000);
    expect(m.weekLeftMinor).toBe(-5000);
    expect(m.todayLeftMinor).toBe(-1250);
  });

  it("midnight is the user's: a spend at 00:30 on Oct 16 Manila is not today's", () => {
    const m = buildSimpleToday(input({ spending: [{ bucketId: LIVING, occurredAt: Date.UTC(2026, 9, 15, 16, 30), amountMinor: 5000 }] }));
    expect(m.week[3].spentMinor).toBe(0);
    expect(m.week[4].spentMinor).toBe(5000);
  });

  it("week days: past shows spent, future shows pace", () => {
    const m = buildSimpleToday(input({ spending: [{ bucketId: FUN, occurredAt: manila("2026-10-13", 18), amountMinor: 12345 }] }));
    expect(m.week.map((d) => d.state)).toEqual(["past", "past", "past", "today", "future", "future", "future"]);
    expect(m.week[1]).toMatchObject({ day: "2026-10-13", spentMinor: 12345, leftMinor: null });
    expect(m.week[5].leftMinor).toBe(m.paceMinor);
  });
});

describe("make it last until", () => {
  it("a chosen day wins; a stipend months away works the same", () => {
    const m = buildSimpleToday(input({ profile: { firstName: "R", nextPaydayDate: "2026-10-20", spendUntil: "2027-01-13", keepBucketId: null }, lefts: { [LIVING]: 2400000, [FUN]: 0 } }));
    expect(m.until).toEqual({ day: "2027-01-13", label: "Wed, Jan 13", source: "chosen" });
    expect(m.daysUntil).toBe(90);
    expect(m.paceMinor).toBe(26666);
    expect(m.todayLeftMinor).toBe(26666);
    expect(m.weekLeftMinor).toBe(26666 * 4);
  });
  it("payday when nothing is chosen", () => {
    const m = buildSimpleToday(input({ profile: { firstName: "R", nextPaydayDate: "2026-10-20", spendUntil: null, keepBucketId: null } }));
    expect(m.until.source).toBe("payday");
    expect(m.daysUntil).toBe(5);
    expect(m.paceMinor).toBe(30000);
  });
  it("a past payday or chosen day falls back to the end of the week", () => {
    const m = buildSimpleToday(input({ profile: { firstName: "R", nextPaydayDate: "2026-10-01", spendUntil: "2026-10-10", keepBucketId: null } }));
    expect(m.until.source).toBe("week-end");
  });
  it("until today counts as one day: everything is for today", () => {
    const m = buildSimpleToday(input({ profile: { firstName: "R", nextPaydayDate: null, spendUntil: "2026-10-15", keepBucketId: null } }));
    expect(m.daysUntil).toBe(1);
    expect(m.todayLeftMinor).toBe(150000);
  });
});

describe("streak", () => {
  it("counts logged and no-spend days, not broken while today is empty", () => {
    const m = buildSimpleToday(input({ loggedSpendDays: ["2026-10-14", "2026-10-12"], noSpendDays: ["2026-10-13"] }));
    expect(m.streak).toEqual({ days: 3, todayDone: false, noSpendToday: false, milestone: null });
  });
  it("a milestone shows on the day it is reached", () => {
    const m = buildSimpleToday(input({ loggedSpendDays: ["2026-10-14", "2026-10-13"], noSpendDays: ["2026-10-15"] }));
    expect(m.streak).toEqual({ days: 3, todayDone: true, noSpendToday: true, milestone: 3 });
  });
});

describe("accounts and pending moves", () => {
  it("shows pending in and out per account from the open checklist, never negative", () => {
    const m = buildSimpleToday(
      input({
        transfers: [
          { from: "acc-bank", to: "acc-cash", amountMinor: 50000, sentMinor: 0 },
          { from: "acc-bank", to: "acc-gcash", amountMinor: 10000, sentMinor: 10000 },
          { from: "acc-cash", to: "acc-bank", amountMinor: 3000, sentMinor: 4000 },
        ],
      }),
    );
    expect(m.accounts).toEqual([
      { id: "acc-bank", name: "Bank", balanceMinor: 400000, pendingInMinor: 0, pendingOutMinor: 50000 },
      { id: "acc-cash", name: "Cash", balanceMinor: 70000, pendingInMinor: 50000, pendingOutMinor: 0 },
    ]);
  });
  it("a partly sent move shows what is left", () => {
    const m = buildSimpleToday(input({ transfers: [{ from: "acc-bank", to: "acc-cash", amountMinor: 50000, sentMinor: 20000 }] }));
    expect(m.accounts[1].pendingInMinor).toBe(30000);
    expect(m.accounts[0].pendingOutMinor).toBe(30000);
  });
  it("no accounts", () => {
    const m = buildSimpleToday(input({ accounts: [] }));
    expect(m.hasAccounts).toBe(false);
    expect(m.receive.defaultReceivedInId).toBeNull();
    expect(m.receive.accounts).toEqual([]);
  });
});

describe("receive defaults", () => {
  it("spending is Living, keep is Emergency by default, last used source and account are remembered", () => {
    const m = buildSimpleToday(input({ lastSourceId: "s-allow", lastReceivedInId: "acc-cash" }));
    expect(m.receive).toEqual({
      accounts: [{ id: "acc-bank", name: "Bank" }, { id: "acc-cash", name: "Cash" }],
      defaultReceivedInId: "acc-cash",
      spendingBucketId: LIVING,
      keepBucketId: EMERGENCY,
      sources: [{ id: "s-allow", name: "Allowance" }],
      lastSourceId: "s-allow",
    });
  });
  it("a remembered account that is gone falls back to the first; an unknown source to none", () => {
    const m = buildSimpleToday(input({ lastSourceId: "s-gone", lastReceivedInId: "acc-gone" }));
    expect(m.receive.defaultReceivedInId).toBe("acc-bank");
    expect(m.receive.lastSourceId).toBeNull();
  });
  it("the keep bucket is the user's pick while it is a live non-Spend bucket", () => {
    expect(keepBucketIdOf(BUCKETS, TAX)).toBe(TAX);
    expect(keepBucketIdOf(BUCKETS, LIVING)).toBe(EMERGENCY);
    expect(keepBucketIdOf(BUCKETS, "b-gone")).toBe(EMERGENCY);
    expect(keepBucketIdOf(BUCKETS.filter((b) => b.id !== EMERGENCY), null)).toBe(TAX);
    expect(keepBucketIdOf(BUCKETS.filter((b) => b.groupKey === "spend"), null)).toBe("");
  });
  it("spending bucket prefers Living, else the first Spend bucket", () => {
    expect(spendingBucketId(BUCKETS)).toBe(LIVING);
    expect(spendingBucketId(BUCKETS.filter((b) => b.id !== LIVING))).toBe(FUN);
    expect(spendingBucketId([])).toBe("");
  });
});

describe("analytics bands never carry the amount", () => {
  it.each([
    [49999, "under_500"],
    [50000, "500_to_2k"],
    [199999, "500_to_2k"],
    [200000, "2k_to_10k"],
    [999999, "2k_to_10k"],
    [1000000, "10k_to_50k"],
    [5000000, "50k_plus"],
  ])("%i centavos is %s", (minor, band) => {
    expect(amountBand(minor)).toBe(band);
  });
});

describe("name", () => {
  it("is trimmed, empty when there is none", () => {
    expect(buildSimpleToday(input({ profile: { firstName: "  Rolf ", nextPaydayDate: null, spendUntil: null, keepBucketId: null } })).firstName).toBe("Rolf");
    expect(buildSimpleToday(input({ profile: { firstName: null, nextPaydayDate: null, spendUntil: null, keepBucketId: null } })).firstName).toBe("");
  });
});
