import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildSortGroups, type SortGroup } from "@/lib/money/sort";

type Client = SupabaseClient<Database>;

/**
 * Money from before the plan that still sits in the wrong bucket (ticket 34), grouped for the
 * "Sort the money you already have" card. Only for people with a plan: just tracking, everything is Spending on purpose.
 */
export async function getSortGroups(client: Client, opts: { planMode: string | null | undefined }): Promise<SortGroup[]> {
  if (opts.planMode !== "plan") return [];
  const unsortedRes = await client.rpc("unsorted_money");
  if (unsortedRes.error) throw new Error(unsortedRes.error.message);
  const unsorted = unsortedRes.data ?? [];
  if (unsorted.length === 0) return [];
  const [bucketsRes, accountsRes, leftRes] = await Promise.all([
    client.from("buckets").select("id, name, hue, keptInAccountId, displayOrder, isArchived").is("deletedAt", null),
    client.from("accounts").select("id, name, displayOrder").is("deletedAt", null),
    client.rpc("bucket_left"),
  ]);
  for (const r of [bucketsRes, accountsRes, leftRes]) if (r.error) throw new Error(r.error.message);
  return buildSortGroups({
    unsorted: unsorted.map((u) => ({ bucketId: u.bucket_id, accountId: u.account_id, amountMinor: u.amount_minor })),
    buckets: bucketsRes.data ?? [],
    accounts: accountsRes.data ?? [],
    leftByBucket: new Map((leftRes.data ?? []).map((l) => [l.bucket_id, l.left_minor])),
  });
}
