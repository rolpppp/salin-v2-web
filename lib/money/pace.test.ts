import { describe, expect, it } from "vitest";
import { addDays } from "./core";
import { dayIn, dayWithWeekday, daysLeftInWeek, daysUntilDay, pace, resolveUntil, spendByDay, streak, weekLeft, weekStrip } from "./pace";

describe("pace: floor, rollover, overspend", () => {
  const rows: Array<[string, { spendableLeftMinor: number; spentTodayMinor: number; daysUntil: number }, { paceMinor: number; todayLeftMinor: number }]> = [
    ["even split, nothing spent", { spendableLeftMinor: 150000, spentTodayMinor: 0, daysUntil: 7 }, { paceMinor: 21428, todayLeftMinor: 21428 }],
    ["floor keeps the remainder in the pot", { spendableLeftMinor: 100, spentTodayMinor: 0, daysUntil: 3 }, { paceMinor: 33, todayLeftMinor: 33 }],
    ["part of today spent: today shrinks, the pace from now barely moves", { spendableLeftMinor: 130000, spentTodayMinor: 20000, daysUntil: 7 }, { paceMinor: 18571, todayLeftMinor: 21428 - 20000 }],
    ["underspend rolls forward: same money, one day fewer, pace rises", { spendableLeftMinor: 150000, spentTodayMinor: 0, daysUntil: 6 }, { paceMinor: 25000, todayLeftMinor: 25000 }],
    ["overspent today: negative left today, shown as is", { spendableLeftMinor: 50000, spentTodayMinor: 70000, daysUntil: 4 }, { paceMinor: 12500, todayLeftMinor: 30000 - 70000 }],
    ["spendable already negative rounds toward the shortfall", { spendableLeftMinor: -1000, spentTodayMinor: 0, daysUntil: 3 }, { paceMinor: -334, todayLeftMinor: -334 }],
    ["until today (0 days) counts as 1: all of it is for today", { spendableLeftMinor: 8000, spentTodayMinor: 0, daysUntil: 0 }, { paceMinor: 8000, todayLeftMinor: 8000 }],
    ["a stipend over a 90 day horizon", { spendableLeftMinor: 2400000, spentTodayMinor: 0, daysUntil: 90 }, { paceMinor: 26666, todayLeftMinor: 26666 }],
    ["90 day horizon after a ₱500 day", { spendableLeftMinor: 2400000 - 50000, spentTodayMinor: 50000, daysUntil: 90 }, { paceMinor: 26111, todayLeftMinor: 26666 - 50000 }],
  ];
  it.each(rows)("%s", (_n, input, want) => {
    const got = pace(input);
    expect(got.paceMinor).toBe(want.paceMinor);
    expect(got.todayLeftMinor).toBe(want.todayLeftMinor);
  });

  it("the day paces never add up to more than the money", () => {
    for (const [left, days] of [[100, 3], [99999, 7], [1, 90], [2400000, 90]] as const) {
      expect(pace({ spendableLeftMinor: left, spentTodayMinor: 0, daysUntil: days }).paceMinor * days).toBeLessThanOrEqual(left);
    }
  });

  it("rolls forward over a week of ₱100 days: each morning's allowance is higher", () => {
    let left = 150000;
    const dawn: number[] = [];
    for (let days = 7; days > 0; days--) {
      dawn.push(pace({ spendableLeftMinor: left, spentTodayMinor: 0, daysUntil: days }).todayLeftMinor);
      left -= 10000;
    }
    expect(dawn).toEqual([21428, 23333, 26000, 30000, 36666, 50000, 90000]);
  });

  it("rejects floats", () => {
    expect(() => pace({ spendableLeftMinor: 10.5, spentTodayMinor: 0, daysUntil: 3 })).toThrow();
    expect(() => pace({ spendableLeftMinor: 100, spentTodayMinor: 0, daysUntil: 2.5 })).toThrow();
  });
});

describe("resolveUntil and daysUntilDay", () => {
  const base = { today: "2026-10-15", weekStart: "2026-10-12" };
  it("chosen wins when it is today or later", () => {
    expect(resolveUntil({ ...base, spendUntil: "2027-01-15", nextPayday: "2026-10-20" })).toEqual({ day: "2027-01-15", source: "chosen" });
    expect(resolveUntil({ ...base, spendUntil: "2026-10-15", nextPayday: null })).toEqual({ day: "2026-10-15", source: "chosen" });
  });
  it("a past chosen day falls through to payday, then to the end of the week", () => {
    expect(resolveUntil({ ...base, spendUntil: "2026-10-14", nextPayday: "2026-10-20" })).toEqual({ day: "2026-10-20", source: "payday" });
    expect(resolveUntil({ ...base, spendUntil: null, nextPayday: "2026-10-14" })).toEqual({ day: "2026-10-19", source: "week-end" });
    expect(resolveUntil({ ...base, spendUntil: null, nextPayday: null })).toEqual({ day: "2026-10-19", source: "week-end" });
  });
  it("counts days, minimum 1", () => {
    expect(daysUntilDay("2026-10-15", "2026-10-19")).toBe(4);
    expect(daysUntilDay("2026-10-15", "2026-10-15")).toBe(1);
    expect(daysUntilDay("2026-10-15", "2027-01-13")).toBe(90);
  });
});

describe("weekLeft", () => {
  const thu = { weekStart: "2026-10-12", today: "2026-10-15" };
  it("is pace x days left in the week when the money lasts beyond it", () => {
    expect(weekLeft({ ...thu, spendableLeftMinor: 150000, daysUntil: 10 })).toBe(60000);
  });
  it("is the whole pot when the money only has to reach the end of the week", () => {
    expect(weekLeft({ ...thu, spendableLeftMinor: 150000, daysUntil: 4 })).toBe(150000);
    expect(weekLeft({ ...thu, spendableLeftMinor: 100, daysUntil: 3 })).toBe(100);
  });
  it("negative money is shown as is", () => {
    expect(weekLeft({ ...thu, spendableLeftMinor: -2500, daysUntil: 4 })).toBe(-2500);
  });
  it("counts the week boundary: first day has 7 days left, last has 1", () => {
    expect(daysLeftInWeek("2026-10-12", "2026-10-12")).toBe(7);
    expect(daysLeftInWeek("2026-10-12", "2026-10-18")).toBe(1);
    expect(() => daysLeftInWeek("2026-10-12", "2026-10-19")).toThrow();
  });
});

describe("weekStrip", () => {
  const spent = { "2026-10-12": 12000, "2026-10-13": 0, "2026-10-14": 30000, "2026-10-15": 5000 };
  const strip = weekStrip({ weekStart: "2026-10-12", today: "2026-10-15", spentByDay: spent, spendableLeftMinor: 95000, daysUntil: 4 });
  it("has seven days with weekday labels and states", () => {
    expect(strip.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(strip.map((d) => d.state)).toEqual(["past", "past", "past", "today", "future", "future", "future"]);
  });
  it("past days show what was spent, no left", () => {
    expect(strip.slice(0, 3).map((d) => [d.spentMinor, d.leftMinor])).toEqual([[12000, null], [0, null], [30000, null]]);
  });
  it("today shows left today: pace at dawn (100000 / 4) minus 5000 spent", () => {
    expect(strip[3]).toMatchObject({ day: "2026-10-15", spentMinor: 5000, leftMinor: 20000 });
  });
  it("future days show the current pace until the until day", () => {
    expect(strip.slice(4).map((d) => d.leftMinor)).toEqual([23750, 23750, 23750]);
    const short = weekStrip({ weekStart: "2026-10-12", today: "2026-10-15", spentByDay: {}, spendableLeftMinor: 20000, daysUntil: 2 });
    expect(short.slice(4).map((d) => d.leftMinor)).toEqual([10000, null, null]);
    const long = weekStrip({ weekStart: "2026-10-12", today: "2026-10-15", spentByDay: {}, spendableLeftMinor: 90000, daysUntil: 30 });
    expect(long.slice(4).map((d) => d.leftMinor)).toEqual([3000, 3000, 3000]);
  });
  it("overspent today is negative, and the pace for later days is already lower", () => {
    const over = weekStrip({ weekStart: "2026-10-12", today: "2026-10-15", spentByDay: { "2026-10-15": 60000 }, spendableLeftMinor: 40000, daysUntil: 4 });
    expect(over[3].leftMinor).toBe(25000 - 60000);
    expect(over[4].leftMinor).toBe(10000);
  });
  it("on the first day of the week nothing is past", () => {
    const mon = weekStrip({ weekStart: "2026-10-12", today: "2026-10-12", spentByDay: {}, spendableLeftMinor: 70000, daysUntil: 7 });
    expect(mon.map((d) => d.state)).toEqual(["today", "future", "future", "future", "future", "future", "future"]);
    expect(mon.map((d) => d.leftMinor)).toEqual(Array(7).fill(10000));
  });
  it("on the last day of the week nothing is in the future", () => {
    const sun = weekStrip({ weekStart: "2026-10-12", today: "2026-10-18", spentByDay: {}, spendableLeftMinor: 7000, daysUntil: 1 });
    expect(sun.map((d) => d.state)).toEqual(["past", "past", "past", "past", "past", "past", "today"]);
    expect(sun[6].leftMinor).toBe(7000);
  });
});

describe("streak", () => {
  const today = "2026-10-15";
  /** A run of `n` logged days ending today (or yesterday when today is not done). */
  const run = (n: number, todayDone: boolean) => {
    const last = todayDone ? today : addDays(today, -1);
    return streak({ today, spendDays: Array.from({ length: n }, (_, i) => addDays(last, -i)), noSpendDays: [] });
  };
  it("counts back through spend and no-spend days", () => {
    expect(streak({ today, spendDays: ["2026-10-15", "2026-10-14"], noSpendDays: ["2026-10-13"] })).toEqual({ days: 3, todayDone: true, noSpendToday: false, milestone: 3 });
  });
  it("today empty: counts from yesterday and is not broken", () => {
    expect(streak({ today, spendDays: ["2026-10-14", "2026-10-13"], noSpendDays: [] })).toEqual({ days: 2, todayDone: false, noSpendToday: false, milestone: null });
  });
  it("a gap ends it", () => {
    expect(streak({ today, spendDays: ["2026-10-15", "2026-10-13", "2026-10-12"], noSpendDays: [] }).days).toBe(1);
  });
  it("yesterday and today empty: zero", () => {
    expect(streak({ today, spendDays: ["2026-10-12"], noSpendDays: [] }).days).toBe(0);
  });
  it("no spend today counts and is reported", () => {
    expect(streak({ today, spendDays: [], noSpendDays: [today] })).toEqual({ days: 1, todayDone: true, noSpendToday: true, milestone: null });
  });
  it("a milestone shows only on the day the streak reaches it, with today done", () => {
    expect(run(3, true).milestone).toBe(3);
    expect(run(7, true).milestone).toBe(7);
    expect(run(14, true).milestone).toBe(14);
    expect(run(30, true).milestone).toBe(30);
    expect(run(4, true).milestone).toBeNull();
    expect(run(7, false).milestone).toBeNull();
    expect(run(7, false).days).toBe(7);
  });
  it("crosses a month and a year boundary", () => {
    expect(streak({ today: "2027-01-01", spendDays: ["2027-01-01", "2026-12-31", "2026-12-30"], noSpendDays: [] }).days).toBe(3);
  });
});

describe("days in the user's zone", () => {
  it("midnight is the zone's: 00:30 Manila on Oct 16 is still Oct 15 in UTC", () => {
    const ms = Date.UTC(2026, 9, 15, 16, 30); // 2026-10-16 00:30 +08:00
    expect(dayIn(ms, "Asia/Manila")).toBe("2026-10-16");
    expect(dayIn(ms, "UTC")).toBe("2026-10-15");
    expect(dayIn(ms, "Australia/Sydney")).toBe("2026-10-16");
    expect(dayIn(ms, "America/Los_Angeles")).toBe("2026-10-15");
  });
  it("23:59 and 00:00 fall on different days", () => {
    expect(dayIn(Date.UTC(2026, 9, 15, 15, 59, 59), "Asia/Manila")).toBe("2026-10-15");
    expect(dayIn(Date.UTC(2026, 9, 15, 16, 0, 0), "Asia/Manila")).toBe("2026-10-16");
  });
  it("sums per day in the zone", () => {
    const e = [
      { occurredAt: Date.UTC(2026, 9, 15, 15, 59), amountMinor: 100 },
      { occurredAt: Date.UTC(2026, 9, 15, 16, 1), amountMinor: 250 },
      { occurredAt: Date.UTC(2026, 9, 15, 2, 0), amountMinor: 50 },
    ];
    expect(spendByDay(e, "Asia/Manila")).toEqual({ "2026-10-15": 150, "2026-10-16": 250 });
  });
  it("labels", () => {
    expect(dayWithWeekday("2026-10-19")).toBe("Mon, Oct 19");
    expect(dayWithWeekday("2027-01-01")).toBe("Fri, Jan 1");
  });
});
