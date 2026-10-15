import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, inbox, minutesOf, noticesFor, unreadCount, upcoming, type NotifyState } from "./rules";

const state = (over: Partial<NotifyState> = {}): NotifyState => ({
  todayIso: "2026-10-15",
  nowMinutes: 12 * 60,
  weekday: 4,
  streak: { days: 5, todayDone: false, noSpendToday: false, milestone: null },
  moneyDay: null,
  reviewDay: 0,
  viewMode: "simple",
  prefs: DEFAULT_PREFS,
  read: new Set(),
  ...over,
});
const kinds = (s: NotifyState) => noticesFor(s).map((n) => n.kind);

describe("noticesFor", () => {
  it("a day with nothing logged: the daily nudge at 8 PM and, for a 3+ day streak, a keep-it reminder later", () => {
    const all = noticesFor(state());
    expect(all.map((n) => [n.kind, n.atMinutes])).toEqual([
      ["streak_risk", 21 * 60 + 30],
      ["daily_log", 20 * 60],
    ]);
    expect(all.every((n) => !n.due)).toBe(true);
    expect(all.find((n) => n.kind === "daily_log")?.body).toContain("5-day streak");
  });
  it("nothing to nudge once today counts", () => {
    expect(kinds(state({ streak: { days: 6, todayDone: true, noSpendToday: true, milestone: null } }))).toEqual([]);
  });
  it("no keep-it reminder for short streaks; the daily nudge still comes", () => {
    expect(kinds(state({ streak: { days: 2, todayDone: false, noSpendToday: false, milestone: null } }))).toEqual(["daily_log"]);
  });
  it("the keep-it reminder sits 90 minutes after the nudge, between 9 PM and 10:30 PM", () => {
    const at = (t: string) => noticesFor(state({ prefs: { ...DEFAULT_PREFS, dailyLogAt: t } })).find((n) => n.kind === "streak_risk")?.atMinutes;
    expect(at("18:00")).toBe(21 * 60);
    expect(at("20:15")).toBe(21 * 60 + 45);
    expect(at("22:00")).toBe(22 * 60 + 30);
  });
  it("money day and review day, with the link for the user's view", () => {
    const all = noticesFor(state({ moneyDay: "2026-10-15", weekday: 0, viewMode: "full" }));
    expect(all.find((n) => n.kind === "money_day")?.href).toBe("/money-in?add=1");
    expect(all.find((n) => n.kind === "weekly_review")?.href).toBe("/review");
    expect(noticesFor(state({ moneyDay: "2026-10-15" })).find((n) => n.kind === "money_day")?.href).toBe("/today");
  });
  it("a milestone is due at once", () => {
    const m = noticesFor(state({ streak: { days: 7, todayDone: true, noSpendToday: false, milestone: 7 } }))[0];
    expect(m).toMatchObject({ kind: "milestone", key: "milestone:7:2026-10-15", due: true, title: "7-day streak" });
  });
  it("respects every switch", () => {
    const off = { dailyLog: false, dailyLogAt: "20:00", streakRisk: false, moneyDay: false, weeklyReview: false, browser: false };
    expect(kinds(state({ prefs: off, moneyDay: "2026-10-15", weekday: 0 }))).toEqual([]);
  });
});

describe("inbox, unread and upcoming", () => {
  it("due notices go to the inbox; read ones stop counting; later ones are scheduled", () => {
    const all = noticesFor(state({ nowMinutes: 20 * 60 + 5, moneyDay: "2026-10-15", read: new Set(["money_day:2026-10-15"]) }));
    expect(inbox(all).map((n) => n.kind)).toEqual(["daily_log", "money_day"]);
    expect(unreadCount(all)).toBe(1);
    expect(upcoming(all).map((n) => n.kind)).toEqual(["streak_risk"]);
  });
});

describe("minutesOf", () => {
  it("reads HH:MM and HH:MM:SS, falls back to 8 PM", () => {
    expect(minutesOf("07:30")).toBe(450);
    expect(minutesOf("21:05:00")).toBe(1265);
    expect(minutesOf("nope")).toBe(1200);
    expect(minutesOf("25:00")).toBe(1200);
  });
});
