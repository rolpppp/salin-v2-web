import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { INCOME_KINDS, type IncomeKind, type IncomeRule } from "./income-kinds";

type Client = SupabaseClient<Database>;

export type SourceView = {
  id: string;
  name: string;
  kind: IncomeKind;
  rule: IncomeRule;
  wholeBucketId: string | null;
  landsInAccountId: string | null;
  isArchived: boolean;
  /** Any income was ever recorded against it: then it can be archived but not removed or renamed. */
  hasIncome: boolean;
  /** Own split in basis points per bucket id (only buckets above 0). */
  split: Record<string, number>;
};

export type SourceBucket = { id: string; name: string; shortName: string; hue: string | null };
export type SourceAccount = { id: string; name: string };

export type IncomeSourcesData = {
  sources: SourceView[];
  /** Buckets a source may point at: not archived, never Rent. */
  buckets: SourceBucket[];
  accounts: SourceAccount[];
  /** The name of the plan that splits the next payday ("Plan A", "Saving for Japan"). */
  activePlan: string;
};

const KINDS = new Set<string>(INCOME_KINDS.map((k) => k.kind));
const RULES = new Set<string>(["plan", "own", "whole", "ask"]);

/** Everything the Income screen shows. RLS limits every query to the signed-in user. Throws on any error. */
export async function getIncomeSourcesData(client: Client, userId: string): Promise<IncomeSourcesData> {
  const [srcRes, bucketRes, accountRes, rentRes, activeRes, lineRes, planRes] = await Promise.all([
    client
      .from("income_sources")
      .select("id, name, kind, rule, wholeBucketId, landsInAccountId, isArchived, createdAt")
      .is("deletedAt", null)
      .order("createdAt")
      .order("id"),
    client.from("buckets").select("id, name, shortName, hue").is("deletedAt", null).eq("isArchived", false).order("displayOrder").order("id"),
    client.from("accounts").select("id, name").is("deletedAt", null).eq("isArchived", false).order("displayOrder").order("id"),
    client.rpc("engine_rent_bucket", { p_user: userId }),
    client.rpc("active_plan", { p_user: userId }),
    // Every split line (RLS limits them to this user's sources), so they ride in the first wave.
    client.from("income_source_split_lines").select("sourceId, bucketId, percentBp").is("deletedAt", null),
    client.from("allocation_plans").select("key, name").is("deletedAt", null),
  ]);
  for (const r of [srcRes, bucketRes, accountRes, rentRes]) if (r.error) throw new Error(r.error.message);
  // active_plan raises when the user has no Emergency bucket yet; the screen still works without it.
  const activeKey = activeRes.error ? "A" : (activeRes.data ?? "A");
  const activePlan = planRes.error ? `Plan ${activeKey}` : ((planRes.data ?? []).find((p) => p.key === activeKey)?.name?.trim() || `Plan ${activeKey}`);

  const rentId = rentRes.data ?? null;
  const buckets: SourceBucket[] = (bucketRes.data ?? [])
    .filter((b) => b.id !== rentId)
    .map((b) => ({ id: b.id, name: b.name, shortName: b.shortName?.trim() || b.name, hue: b.hue }));
  const accounts: SourceAccount[] = (accountRes.data ?? []).map((a) => ({ id: a.id, name: a.name }));
  const rows = srcRes.data ?? [];

  const ids = rows.map((r) => r.id);
  const usedRes = await Promise.all(ids.map((id) => client.from("income_meta").select("id").eq("sourceId", id).limit(1)));
  if (lineRes.error) throw new Error(lineRes.error.message);
  for (const u of usedRes) if (u.error) throw new Error(u.error.message);

  const sources: SourceView[] = rows.map((r, i) => {
    const split: Record<string, number> = {};
    for (const l of lineRes.data ?? []) if (l.sourceId === r.id && l.percentBp > 0) split[l.bucketId] = l.percentBp;
    return {
      id: r.id,
      name: r.name,
      kind: (KINDS.has(r.kind) ? r.kind : "other") as IncomeKind,
      rule: (RULES.has(r.rule) ? r.rule : "ask") as IncomeRule,
      wholeBucketId: r.wholeBucketId,
      landsInAccountId: r.landsInAccountId,
      isArchived: r.isArchived,
      hasIncome: (usedRes[i].data ?? []).length > 0,
      split,
    };
  });
  return { sources, buckets, accounts, activePlan };
}
