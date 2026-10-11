import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CategoryType } from "@/lib/domain/enums";
import { zonedMidnight, zonedParts } from "@/lib/time";

type Client = SupabaseClient<Database>;

export type SpendRow = { category_id: string; bucket_id: string | null; entries: number; total_minor: number };

export type CategoryItem = {
  id: string;
  name: string;
  /** This month's spending in the bucket it sits in now (home currency), and entry count. */
  monthMinor: number;
  monthEntries: number;
  /** Why it can't be removed, or null (BR 6.3). */
  inUseReason: string | null;
  /** Where its older entries this month sit when that isn't where it is now ("Older entries in Living"). */
  olderIn: string[];
};

/** BR 6.2: entries logged before a move stay in the old bucket and say so there. */
export type MovedLine = { categoryId: string; categoryName: string; nowIn: string | null; totalMinor: number };

export type BucketGroup = {
  id: string | null; // null: "Not in a bucket yet"
  name: string;
  hue: string | null;
  monthMinor: number;
  categories: CategoryItem[];
  moved: MovedLine[];
};

export type CategoriesData = {
  groups: BucketGroup[];
  buckets: { id: string; name: string }[];
  monthLabel: string;
  hasCategories: boolean;
};

type BucketInput = { id: string; name: string; hue: string | null };
type CategoryInput = { id: string; name: string; bucketId: string | null };

/**
 * Pure grouping. Spending belongs to the bucket each entry was snapshotted into (BR 4.1); a category row
 * shows the part of its spending that sits in its CURRENT bucket, and the rest becomes a "logged before the
 * move" line on the OLD bucket. Rent is listed only when it has categories or spending (SPEC 4.4).
 */
export function buildGroups(args: {
  buckets: BucketInput[];
  categories: CategoryInput[];
  spend: SpendRow[];
  reasons: Map<string, string | null>;
}): BucketGroup[] {
  const { buckets, categories, spend, reasons } = args;
  const bucketName = new Map(buckets.map((b) => [b.id, b.name]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const makeGroup = (b: { id: string | null; name: string; hue: string | null }): BucketGroup => ({ ...b, monthMinor: 0, categories: [], moved: [] });
  const groups = new Map<string | null, BucketGroup>(buckets.map((b) => [b.id, makeGroup(b)]));
  groups.set(null, makeGroup({ id: null, name: "Not in a bucket yet", hue: null }));

  for (const c of categories) {
    const own = spend.filter((s) => s.category_id === c.id);
    const here = own.filter((s) => s.bucket_id === c.bucketId);
    const older = own.filter((s) => s.bucket_id !== c.bucketId && s.bucket_id !== null);
    const g = groups.get(c.bucketId) ?? groups.get(null)!;
    g.categories.push({
      id: c.id,
      name: c.name,
      monthMinor: here.reduce((a, s) => a + s.total_minor, 0),
      monthEntries: here.reduce((a, s) => a + s.entries, 0),
      inUseReason: reasons.get(c.id) ?? null,
      olderIn: [...new Set(older.map((s) => bucketName.get(s.bucket_id!) ?? "another bucket"))],
    });
  }
  for (const s of spend) {
    const g = groups.get(s.bucket_id);
    if (!g) continue;
    g.monthMinor += s.total_minor;
    const c = catById.get(s.category_id);
    if (c && c.bucketId !== s.bucket_id) {
      g.moved.push({ categoryId: c.id, categoryName: c.name, nowIn: c.bucketId ? (bucketName.get(c.bucketId) ?? null) : null, totalMinor: s.total_minor });
    }
  }
  return [...groups.values()].filter((g) => {
    if (g.id === null) return g.categories.length > 0;
    const isRent = /^rent$/i.test(g.name) || g.hue === "rent";
    return !isRent || g.categories.length > 0 || g.monthMinor > 0;
  });
}

function monthRange(nowMs: number, tz: string): { startMs: number; endMs: number; label: string } {
  const p = zonedParts(nowMs, tz);
  const next = p.month === 12 ? { y: p.year + 1, m: 1 } : { y: p.year, m: p.month + 1 };
  const label = new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: tz }).format(new Date(nowMs));
  return { startMs: zonedMidnight(p.year, p.month, 1, tz), endMs: zonedMidnight(next.y, next.m, 1, tz), label };
}

export async function getCategoriesData(client: Client, opts: { nowMs: number; timeZone: string; homeCurrency: string }): Promise<CategoriesData> {
  const month = monthRange(opts.nowMs, opts.timeZone);
  const [bucketsRes, catsRes, mapRes, spendRes, useRes] = await Promise.all([
    client.from("buckets").select("id, name, hue, displayOrder").is("deletedAt", null).eq("isArchived", false).order("displayOrder").order("id"),
    client.from("categories").select("id, name, displayOrder").is("deletedAt", null).eq("categoryType", CategoryType.expense).order("displayOrder").order("id"),
    client.from("category_buckets").select("categoryId, bucketId").is("deletedAt", null),
    client.rpc("category_month_spend", { p_from: month.startMs, p_to: month.endMs, p_currency: opts.homeCurrency }),
    client.rpc("categories_in_use"),
  ]);
  for (const r of [bucketsRes, catsRes, mapRes, spendRes, useRes]) if (r.error) throw new Error(r.error.message);

  const mapped = new Map((mapRes.data ?? []).map((m) => [m.categoryId, m.bucketId]));
  const buckets = bucketsRes.data ?? [];
  const categories = (catsRes.data ?? []).map((c) => ({ id: c.id, name: c.name, bucketId: mapped.get(c.id) ?? null }));
  return {
    groups: buildGroups({
      buckets,
      categories,
      spend: spendRes.data ?? [],
      reasons: new Map((useRes.data ?? []).map((u) => [u.category_id, u.reason])),
    }),
    buckets: buckets.map((b) => ({ id: b.id, name: b.name })),
    monthLabel: month.label,
    hasCategories: categories.length > 0,
  };
}
