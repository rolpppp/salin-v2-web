import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildStartGroups, type StartGroup } from "./starting-model";

type Client = SupabaseClient<Database>;

/**
 * The "Sort the money you already have" groups (ticket 38): per PHP account, the money the buckets don't count yet,
 * pre-filled by the active plan (P-14). `account_balances` does the arithmetic; this reads and reshapes. Throws on any
 * error so the caller can leave the card out instead of showing wrong numbers.
 */
export async function getStartGroups(client: Client): Promise<StartGroup[]> {
  const balRes = await client.rpc("account_balances");
  if (balRes.error) throw new Error(balRes.error.message);
  const gaps = (balRes.data ?? []).filter((b) => b.unbucketed_minor > 0);
  if (gaps.length === 0) return [];
  const [accountsRes, bucketsRes, activeRes, plansRes, linesRes] = await Promise.all([
    client.from("accounts").select("id, name, displayOrder").is("deletedAt", null),
    client.from("buckets").select("id, name, hue, groupKey, keptInAccountId, displayOrder, isArchived, planless").is("deletedAt", null),
    client.rpc("active_plan"),
    client.from("allocation_plans").select("id, key").is("deletedAt", null),
    client.from("allocation_plan_lines").select("planId, bucketId, percentBp").is("deletedAt", null),
  ]);
  for (const r of [accountsRes, bucketsRes, plansRes, linesRes]) if (r.error) throw new Error(r.error.message);
  const key = activeRes.error ? null : (activeRes.data as string | null);
  const plans = (plansRes.data ?? []).filter((p) => p.key === key);
  // A key that matches more than one plan reads as none, like the Review loader.
  const planId = plans.length === 1 ? plans[0]!.id : null;
  const percentBp = new Map((linesRes.data ?? []).filter((l) => l.planId === planId).map((l) => [l.bucketId, l.percentBp]));
  const rows = new Map(gaps.map((g) => [g.account_id, g.unbucketed_minor]));
  return buildStartGroups({
    accounts: (accountsRes.data ?? []).filter((a) => rows.has(a.id)).map((a) => ({ id: a.id, name: a.name, displayOrder: a.displayOrder, unbucketedMinor: rows.get(a.id) ?? 0 })),
    buckets: bucketsRes.data ?? [],
    percentBp,
  });
}
