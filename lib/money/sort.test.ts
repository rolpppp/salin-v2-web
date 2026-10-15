import { describe, expect, it } from "vitest";
import { buildSortGroups, sortKey, sortLines, type SortBucketInput } from "./sort";

// The owner's case: ₱7,500 of Spending sent to Maya, the bank and Cash before the plan existed.
const buckets: SortBucketInput[] = [
  { id: "living", name: "Living", hue: "living", keptInAccountId: "gcash", displayOrder: 1, isArchived: false },
  { id: "fun", name: "Fun money", hue: "fun", keptInAccountId: "maya", displayOrder: 2, isArchived: false },
  { id: "em", name: "Emergency fund", hue: "emergency", keptInAccountId: "bank", displayOrder: 3, isArchived: false },
  { id: "inv", name: "Investments", hue: "invest", keptInAccountId: "bank", displayOrder: 4, isArchived: false },
  { id: "old", name: "Old", hue: null, keptInAccountId: "bank", displayOrder: 9, isArchived: true },
];
const accounts = [
  { id: "gcash", name: "GCash", displayOrder: 1 },
  { id: "maya", name: "Maya", displayOrder: 2 },
  { id: "bank", name: "MariBank", displayOrder: 3 },
];
const unsorted = [
  { bucketId: "living", accountId: "bank", amountMinor: 500_000 },
  { bucketId: "living", accountId: "maya", amountMinor: 120_000 },
];

describe("buildSortGroups", () => {
  it("one group per account in account order; suggests the first bucket kept there, never an archived one", () => {
    const groups = buildSortGroups({ unsorted, buckets, accounts, leftByBucket: new Map([["living", 750_000]]) });
    expect(groups.map((g) => [g.accountName, g.amountMinor])).toEqual([
      ["Maya", 120_000],
      ["MariBank", 500_000],
    ]);
    expect(groups[0]!.targets).toEqual([{ bucketId: "fun", name: "Fun money", hue: "fun", suggestedMinor: 120_000 }]);
    expect(groups[1]!.targets.map((t) => [t.name, t.suggestedMinor])).toEqual([
      ["Emergency fund", 500_000],
      ["Investments", 0],
    ]);
  });

  it("caps by what the bucket has left, across its groups in order", () => {
    const groups = buildSortGroups({ unsorted, buckets, accounts, leftByBucket: new Map([["living", 300_000]]) });
    expect(groups.map((g) => [g.accountName, g.amountMinor])).toEqual([
      ["Maya", 120_000],
      ["MariBank", 180_000],
    ]);
  });

  it("nothing left, or nowhere to sort to: no groups", () => {
    expect(buildSortGroups({ unsorted, buckets, accounts, leftByBucket: new Map([["living", 0]]) })).toEqual([]);
    expect(buildSortGroups({ unsorted: [{ bucketId: "living", accountId: "bank", amountMinor: 100 }], buckets: buckets.filter((b) => b.keptInAccountId !== "bank"), accounts, leftByBucket: new Map([["living", 100]]) })).toEqual([]);
  });
});

describe("sortLines", () => {
  const groups = buildSortGroups({ unsorted, buckets, accounts, leftByBucket: new Map([["living", 750_000]]) });

  it("sends only amounts above zero, and totals them", () => {
    const amounts = new Map([
      [sortKey(groups[0]!, "fun"), 120_000],
      [sortKey(groups[1]!, "em"), 400_000],
      [sortKey(groups[1]!, "inv"), 100_000],
    ]);
    const r = sortLines(groups, amounts);
    expect(r.over).toBeNull();
    expect(r.totalMinor).toBe(620_000);
    expect(r.lines).toEqual([
      { from: "living", to: "fun", account: "maya", amount: 120_000 },
      { from: "living", to: "em", account: "bank", amount: 400_000 },
      { from: "living", to: "inv", account: "bank", amount: 100_000 },
    ]);
  });

  it("flags a group whose amounts add up to more than it has", () => {
    const r = sortLines(groups, new Map([[sortKey(groups[1]!, "em"), 400_000], [sortKey(groups[1]!, "inv"), 100_001]]));
    expect(r.over?.accountName).toBe("MariBank");
  });
});
