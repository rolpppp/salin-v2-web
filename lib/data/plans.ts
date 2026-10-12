import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type PlanBucket = {
  id: string;
  name: string;
  shortName: string;
  hue: string | null;
  note: string | null;
  planless: boolean;
  keptInAccountId: string | null;
};

export type PlanAccount = { id: string; name: string; isArchived: boolean };

/** One plan: percentages in basis points per bucket id (a bucket without a line is 0). */
export type PlanView = { key: string; name: string; lines: Record<string, number> };

export type SwitchRule = {
  targetMinor: number;
  /** D-14 measure: everything ever allocated to the switch bucket (the same number active_plan uses). */
  nowMinor: number;
  bucketName: string;
  toPlan: string;
};

export type RedirectRule = { fromBucketName: string; toBucketName: string; untilDate: string };

export type SplitPlanData = {
  buckets: PlanBucket[];
  accounts: PlanAccount[];
  plans: PlanView[];
  activePlan: string;
  switchRule: SwitchRule | null;
  redirectRule: RedirectRule | null;
};

const PLAN_KEYS = ["A", "B"] as const;

function obj(v: Json | undefined): Record<string, Json | undefined> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
}
const str = (v: Json | undefined): string | null => (typeof v === "string" ? v : null);
const int = (v: Json | undefined): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);

/** Everything the Split plan screen shows. RLS limits every query to the signed-in user. Throws on any error. */
export async function getSplitPlanData(client: Client, userId: string): Promise<SplitPlanData> {
  // One wave for everything that doesn't depend on another read (lines and the active plan included; the lines are
  // filtered to the A/B plans below). Only the switch rule's measure needs the rules first.
  const [bucketRes, accountRes, planRes, ruleRes, allLineRes, activeRes] = await Promise.all([
    client
      .from("buckets")
      .select("id, name, shortName, hue, note, planless, keptInAccountId, displayOrder")
      .is("deletedAt", null)
      .eq("isArchived", false)
      .order("displayOrder")
      .order("id"),
    client.from("accounts").select("id, name, isArchived").is("deletedAt", null).order("displayOrder").order("id"),
    client.from("allocation_plans").select("id, key, name").is("deletedAt", null).in("key", [...PLAN_KEYS]).order("key"),
    client.from("allocation_rules").select("kind, params, createdAt, id").is("deletedAt", null).order("createdAt").order("id"),
    client.from("allocation_plan_lines").select("planId, bucketId, percentBp").is("deletedAt", null),
    client.rpc("active_plan", { p_user: userId }),
  ]);
  for (const r of [bucketRes, accountRes, planRes, ruleRes]) if (r.error) throw new Error(r.error.message);

  const buckets: PlanBucket[] = (bucketRes.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    shortName: b.shortName?.trim() || b.name,
    hue: b.hue,
    note: b.note,
    planless: b.planless,
    keptInAccountId: b.keptInAccountId,
  }));
  const accounts: PlanAccount[] = (accountRes.data ?? []).map((a) => ({ id: a.id, name: a.name, isArchived: a.isArchived }));
  const planRows = planRes.data ?? [];

  const lineRes = planRows.length ? allLineRes : { data: [], error: null };
  if (lineRes.error) throw new Error(lineRes.error.message);
  const plans: PlanView[] = planRows.map((p) => {
    const lines: Record<string, number> = {};
    for (const l of lineRes.data ?? []) if (l.planId === p.id) lines[l.bucketId] = l.percentBp;
    return { key: p.key, name: p.name, lines };
  });

  const bucketName = (id: string | null) => buckets.find((b) => b.id === id)?.name ?? null;
  const rules = ruleRes.data ?? [];

  let switchRule: SwitchRule | null = null;
  const sw = rules.find((r) => r.kind === "switch_on_goal");
  if (sw) {
    const p = obj(sw.params);
    const target = int(p.targetMinor);
    const bucketId = str(p.bucketId) ?? buckets.find((b) => b.hue === "emergency")?.id ?? null;
    if (target !== null && bucketId) {
      const { data, error } = await client.rpc("engine_plan_measure", { p_user: userId, p_bucket: bucketId });
      if (error) throw new Error(error.message);
      switchRule = { targetMinor: target, nowMinor: data ?? 0, bucketName: bucketName(bucketId) ?? "Emergency fund", toPlan: str(p.toPlan) ?? "B" };
    }
  }

  let redirectRule: RedirectRule | null = null;
  const rd = rules.find((r) => r.kind === "redirect_until_date");
  if (rd) {
    const p = obj(rd.params);
    const until = str(p.untilDate);
    const from = bucketName(str(p.fromBucketId));
    const to = bucketName(str(p.toBucketId));
    if (until && from && to) redirectRule = { fromBucketName: from, toBucketName: to, untilDate: until };
  }

  const active = planRows.length ? activeRes : { data: "A", error: null };
  if (active.error) throw new Error(active.error.message);

  return { buckets, accounts, plans, activePlan: active.data ?? "A", switchRule, redirectRule };
}
