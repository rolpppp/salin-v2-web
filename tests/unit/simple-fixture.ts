import { addDays } from "@/lib/money/core";
import type { SimpleTodayModel } from "@/lib/data/simple-today";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dow(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
function longLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A calm mid-week fixture: Monday-first week, 4 days left, two accounts, one pending move. */
export function buildSimpleTodayStub(todayIso: string, over: Partial<SimpleTodayModel> = {}): SimpleTodayModel {
  const monday = addDays(todayIso, -((dow(todayIso) + 6) % 7));
  const paceMinor = 56_900;
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const state = day < todayIso ? ("past" as const) : day === todayIso ? ("today" as const) : ("future" as const);
    return {
      day,
      label: DOW[dow(day)] ?? "",
      state,
      spentMinor: state === "past" ? 40_000 + i * 7_300 : state === "today" ? 12_500 : 0,
      leftMinor: state === "past" ? null : state === "today" ? paceMinor - 12_500 : paceMinor,
    };
  });
  const untilDay = addDays(monday, 7);
  return {
    firstName: "Maria",
    todayLeftMinor: paceMinor - 12_500,
    weekLeftMinor: paceMinor * 4,
    paceMinor,
    until: { day: untilDay, label: longLabel(untilDay), source: "week-end" },
    daysUntil: 4,
    week,
    streak: { days: 5, todayDone: true, noSpendToday: false, milestone: null },
    accounts: [
      { id: "acc-mari", name: "MariBank", balanceMinor: 1_245_000, pendingInMinor: 0, pendingOutMinor: 50_000 },
      { id: "acc-cash", name: "Cash", balanceMinor: 80_000, pendingInMinor: 50_000, pendingOutMinor: 0 },
    ],
    spendableLeftMinor: paceMinor * 4,
    keptAsideMinor: 800_000,
    hasAccounts: true,
    receive: {
      accounts: [
        { id: "acc-mari", name: "MariBank" },
        { id: "acc-cash", name: "Cash" },
      ],
      defaultReceivedInId: "acc-mari",
      spendingBucketId: "bucket-living",
      keepBucketId: "bucket-emergency",
      sources: [
        { id: "src-work", name: "Work" },
        { id: "src-gift", name: "Gift" },
      ],
      lastSourceId: "src-work",
    },
    ...over,
  };
}
