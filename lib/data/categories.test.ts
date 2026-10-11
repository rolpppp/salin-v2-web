import { describe, expect, it } from "vitest";
import { buildGroups, type SpendRow } from "./categories";

const buckets = [
  { id: "living", name: "Living", hue: "living" },
  { id: "fun", name: "Fun", hue: "fun" },
  { id: "rent", name: "Rent", hue: "rent" },
];
const reasons = new Map<string, string | null>([["load", "it has entries"], ["empty", null]]);
const spend = (category_id: string, bucket_id: string | null, total_minor: number, entries = 1): SpendRow => ({ category_id, bucket_id, entries, total_minor });

describe("buildGroups", () => {
  it("BR 6.2: entries logged before a move stay in the old bucket and say so there", () => {
    const groups = buildGroups({
      buckets,
      categories: [{ id: "load", name: "Load & data", bucketId: "fun" }],
      spend: [spend("load", "living", 15_000), spend("load", "fun", 2_000, 2)],
      reasons,
    });
    const living = groups.find((g) => g.id === "living")!;
    const fun = groups.find((g) => g.id === "fun")!;
    expect(living.moved).toEqual([{ categoryId: "load", categoryName: "Load & data", nowIn: "Fun", totalMinor: 15_000 }]);
    expect(living.monthMinor).toBe(15_000); // spending counts where it was logged
    expect(fun.monthMinor).toBe(2_000);
    expect(fun.categories[0]).toMatchObject({ monthMinor: 2_000, monthEntries: 2, olderIn: ["Living"], inUseReason: "it has entries" });
    expect(living.categories).toHaveLength(0);
  });

  it("lists Rent only when it has categories or spending", () => {
    const none = buildGroups({ buckets, categories: [], spend: [], reasons });
    expect(none.map((g) => g.name)).toEqual(["Living", "Fun"]);
    const withCat = buildGroups({ buckets, categories: [{ id: "empty", name: "Landlord", bucketId: "rent" }], spend: [], reasons });
    expect(withCat.map((g) => g.name)).toContain("Rent");
  });

  it("puts unmapped categories under 'Not in a bucket yet', and only when there are some", () => {
    const g = buildGroups({ buckets, categories: [{ id: "empty", name: "Misc", bucketId: null }], spend: [spend("empty", null, 500)], reasons });
    const last = g[g.length - 1];
    expect(last.id).toBeNull();
    expect(last.name).toBe("Not in a bucket yet");
    expect(last.categories[0].monthMinor).toBe(500);
    expect(buildGroups({ buckets, categories: [], spend: [], reasons }).some((x) => x.id === null)).toBe(false);
  });

  it("keeps amounts as integers (no float drift)", () => {
    const [living] = buildGroups({
      buckets,
      categories: [{ id: "empty", name: "A", bucketId: "living" }],
      spend: [spend("empty", "living", 130_000), spend("empty", "living", 50)],
      reasons,
    });
    expect(living.monthMinor).toBe(130_050);
    expect(Number.isInteger(living.monthMinor)).toBe(true);
  });
});
