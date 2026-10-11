import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CategoryType } from "@/lib/domain/enums";
import {
  daysUntil,
  groupCategories,
  spendSafe,
  type BucketGroupKey,
  type LogAccount,
  type LogBucket,
  type LogCategory,
  type LogSpendingData,
} from "./log-spending-model";
import { isoDateIn } from "./money-in-model";

type Client = SupabaseClient<Database>;

const GROUP_KEYS: readonly string[] = ["spend", "save", "set_aside"];

/** Active buckets in shelf data shape. */
export async function getLogBuckets(client: Client): Promise<LogBucket[]> {
  const { data, error } = await client
    .from("buckets")
    .select("id, name, groupKey, hue, keptInAccountId, displayOrder")
    .is("deletedAt", null)
    .eq("isArchived", false)
    .order("displayOrder")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((b) => GROUP_KEYS.includes(b.groupKey))
    .map((b) => ({ id: b.id, name: b.name, groupKey: b.groupKey as BucketGroupKey, hue: b.hue, keptInAccountId: b.keptInAccountId, displayOrder: b.displayOrder }));
}

/** left per bucket (BR §4.2) from the engine function, as the signed-in user. */
export async function getBucketLefts(client: Client): Promise<Record<string, number>> {
  const { data, error } = await client.rpc("bucket_left");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.bucket_id, r.left_minor]));
}

/**
 * Everything the Log spending sheet needs: expense categories grouped by the bucket they sit in now,
 * each bucket's left, safe to spend, days until payday and the home-currency accounts to pay from.
 */
export async function getLogSpendingData(client: Client, opts: { nowMs: number; timeZone: string }): Promise<LogSpendingData> {
  const todayIso = isoDateIn(opts.nowMs, opts.timeZone);
  const [profileRes, buckets, lefts, catsRes, mapRes, accRes] = await Promise.all([
    client.from("user_profiles").select("homeCurrency, nextPaydayDate, deletedAt").maybeSingle(),
    getLogBuckets(client),
    getBucketLefts(client),
    client.from("categories").select("id, name, displayOrder").is("deletedAt", null).eq("categoryType", CategoryType.expense).order("displayOrder").order("id"),
    client.from("category_buckets").select("categoryId, bucketId").is("deletedAt", null),
    client.from("accounts").select("id, name, currency, displayOrder").is("deletedAt", null).eq("isArchived", false).order("displayOrder").order("id"),
  ]);
  for (const r of [profileRes, catsRes, mapRes, accRes]) if (r.error) throw new Error(r.error.message);

  const homeCurrency = profileRes.data?.homeCurrency ?? "PHP";
  const bucketOf = new Map((mapRes.data ?? []).map((m) => [m.categoryId, m.bucketId]));
  const categories: LogCategory[] = (catsRes.data ?? []).flatMap((c) => {
    const bucketId = bucketOf.get(c.id);
    return bucketId ? [{ id: c.id, name: c.name, bucketId }] : [];
  });
  const accounts: LogAccount[] = (accRes.data ?? []).filter((a) => a.currency === homeCurrency).map((a) => ({ id: a.id, name: a.name }));

  return {
    todayIso,
    homeCurrency,
    groups: groupCategories(buckets, categories),
    lefts,
    safeMinor: spendSafe(buckets, lefts),
    daysUntilPayday: daysUntil(profileRes.data?.nextPaydayDate ?? null, todayIso),
    accounts,
  };
}
