import { describe, expect, it } from "vitest";
import { buildStartGroups, startKey, startLines, type StartBucketRow } from "./starting-model";
import { buildDrawers } from "./today-model";
import { BUCKET, flowsOf, g9, TODAY } from "./today-testkit";

const b = (id: string, name: string, hue: string | null, groupKey: string, keptInAccountId: string | null, displayOrder: number, extra: Partial<StartBucketRow> = {}): StartBucketRow => ({
  id,
  name,
  hue,
  groupKey,
  keptInAccountId,
  displayOrder,
  isArchived: false,
  planless: false,
  ...extra,
});

// The owner's accounts: GCash keeps Spending + Fun, MariBank keeps Emergency/Buffer/Goals, GoTrade keeps Investment, Cash none.
const buckets = [
  b("spend", "Spending", "living", "spend", "gc", 1),
  b("fun", "Fun money", "fun", "spend", "gc", 2),
  b("em", "Emergency", "emergency", "save", "bank", 3),
  b("buf", "Buffer", "buffer", "set_aside", "bank", 4),
  b("goals", "Goals", "c3", "save", "bank", 5),
  b("inv", "Investment", "invest", "save", "gt", 6),
  b("old", "Old", null, "save", "bank", 7, { isArchived: true }),
];
const accounts = [
  { id: "gc", name: "GCash", displayOrder: 1, unbucketedMinor: 1_500_000 },
  { id: "bank", name: "MariBank", displayOrder: 2, unbucketedMinor: 2_000_000 },
  { id: "gt", name: "GoTrade", displayOrder: 3, unbucketedMinor: 500_000 },
  { id: "cash", name: "Cash", displayOrder: 4, unbucketedMinor: 300_000 },
  { id: "empty", name: "Empty", displayOrder: 5, unbucketedMinor: 0 },
];
const percentBp = new Map([["spend", 4000], ["fun", 1000], ["em", 3000], ["buf", 500], ["goals", 500], ["inv", 1000]]);

describe("buildStartGroups (P-14 golden case)", () => {
  const groups = buildStartGroups({ accounts, buckets, percentBp });
  it("one group per account with money to sort, in account order", () => {
    expect(groups.map((g) => g.accountName)).toEqual(["GCash", "MariBank", "GoTrade", "Cash"]);
  });
  it("pre-fills by plan among the buckets kept there; Cash (no bucket) goes to Spending", () => {
    const rows = (id: string) => groups.find((g) => g.accountId === id)!.rows.map((r) => [r.name, r.suggestedMinor]);
    expect(rows("gc")).toEqual([["Spending", 1_200_000], ["Fun money", 300_000]]);
    expect(rows("bank")).toEqual([["Emergency", 1_500_000], ["Buffer", 250_000], ["Goals", 250_000]]);
    expect(rows("gt")).toEqual([["Investment", 500_000]]);
    expect(rows("cash")).toEqual([["Spending", 300_000]]);
  });
  it("every group's suggestion adds up to its unbucketed money", () => {
    for (const g of groups) expect(g.rows.reduce((t, r) => t + r.suggestedMinor, 0)).toBe(g.unbucketedMinor);
  });
  it("offers the other live buckets (not archived ones) as extra rows", () => {
    const cash = groups.find((g) => g.accountId === "cash")!;
    expect(cash.picks.map((p) => p.name)).toEqual(["Fun money", "Emergency", "Buffer", "Goals", "Investment"]);
  });
  it("a plan-less user (no percentages) puts a kept account's money in its first bucket", () => {
    const g = buildStartGroups({ accounts: [accounts[1]!], buckets, percentBp: new Map() });
    expect(g[0]!.rows.map((r) => r.suggestedMinor)).toEqual([2_000_000, 0, 0]);
  });
});

describe("startLines", () => {
  const groups = buildStartGroups({ accounts, buckets, percentBp });
  const amounts = new Map<string, number>([
    [startKey("gc", "spend"), 1_000_000],
    [startKey("gc", "fun"), 500_000],
    [startKey("cash", "spend"), 300_000],
    [startKey("cash", "inv"), 1],
  ]);
  it("sends the positive amounts, counts accounts, and names an account that is over", () => {
    const r = startLines(groups, amounts, new Map([["cash", ["inv"]]]));
    expect(r.lines).toEqual([
      { bucketId: "spend", accountId: "gc", amountMinor: 1_000_000 },
      { bucketId: "fun", accountId: "gc", amountMinor: 500_000 },
      { bucketId: "spend", accountId: "cash", amountMinor: 300_000 },
      { bucketId: "inv", accountId: "cash", amountMinor: 1 },
    ]);
    expect(r.accounts).toBe(2);
    expect(r.over?.accountId).toBe("cash");
    expect(r.totalMinor).toBe(1_800_001);
  });
  it("a row that was not added is ignored", () => {
    expect(startLines(groups, amounts, new Map()).over).toBeNull();
  });
});

describe("drawer history (ticket 38)", () => {
  const input = g9({
    flows: flowsOf({ emergency: 600_000 }, {}, []),
    starts: [{ id: "s1", bucketId: BUCKET.emergency, dateIso: `2026-10-0${TODAY - 6}`, amountMinor: 500_000, accountName: "MariBank" }],
    coversThisMonth: [{ fromBucketId: BUCKET.fun, toBucketId: BUCKET.emergency, dateIso: "2026-10-09", amountMinor: 100_000, note: "move" }],
  });
  const d = buildDrawers(input)[BUCKET.emergency]!;
  it("lists starting money with its account, removable by id, and moves as 'Moved from'", () => {
    const start = d.lines.find((l) => l.kind === "start");
    expect(start).toMatchObject({ amountMinor: 500_000, startId: "s1" });
    expect(start?.label).toContain("Money you already had in MariBank");
    expect(d.lines.find((l) => l.kind === "cover_in")?.label).toContain("Moved from");
  });
  it("offers moves up to what is left, to every other live bucket", () => {
    expect(d.moveMaxMinor).toBe(d.leftMinor);
    expect(d.moveTargets.every((t) => t.bucketId !== BUCKET.emergency)).toBe(true);
    expect(d.moveTargets.length).toBeGreaterThan(0);
  });
});
