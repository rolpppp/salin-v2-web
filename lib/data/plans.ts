import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { isBuiltinHue } from "./hues";

type Client = SupabaseClient<Database>;

export type BucketGroupKey = "spend" | "save" | "set_aside";

export type PlanBucket = {
  id: string;
  name: string;
  shortName: string;
  hue: string | null;
  groupKey: BucketGroupKey;
  note: string | null;
  planless: boolean;
  keptInAccountId: string | null;
  /** Built-in buckets are identified by their hue: the colour can't change and the engine finds them by it. */
  isBuiltin: boolean;
};

export type PlanAccount = { id: string; name: string; isArchived: boolean };

/** One plan: percentages in basis points per bucket id (a bucket without a line is 0). */
export type PlanView = { key: string; name: string; lines: Record<string, number> };

/** What `plan_settings()` says, parsed. */
export type PlanSettings = {
  mode: "auto" | "manual";
  /** The plan that splits the next payday (manual: the chosen plan; auto: from or to by the Emergency measure). */
  activeKey: string;
  autoFrom: string;
  autoTo: string;
  /** Emergency target in centavos; null when no switch target is set. */
  targetMinor: number | null;
  /** D-14 measure: everything ever allocated to the Emergency bucket (the number `active_plan` uses). */
  nowMinor: number;
  emergencyBucketId: string | null;
  emergencyName: string;
};

export type RedirectRule = { fromBucketName: string; toBucketName: string; untilDate: string };

export type SplitPlanData = {
  buckets: PlanBucket[];
  /** Archived buckets, for the Restore list. */
  archived: PlanBucket[];
  accounts: PlanAccount[];
  plans: PlanView[];
  settings: PlanSettings;
  redirectRule: RedirectRule | null;
};

function obj(v: Json | undefined | unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);

/** Parses `plan_settings()` (jsonb) defensively; missing parts get the pre-v2 defaults (auto, A to B). */
export function parsePlanSettings(raw: Json | null | undefined): Omit<PlanSettings, "nowMinor" | "emergencyName"> {
  const o = obj(raw);
  const mode = o.mode === "manual" ? "manual" : "auto";
  const target = int(o.targetMinor);
  return {
    mode,
    activeKey: str(o.activeKey) ?? "A",
    autoFrom: str(o.autoFrom) ?? "A",
    autoTo: str(o.autoTo) ?? "B",
    targetMinor: target !== null && target > 0 ? target : null,
    emergencyBucketId: str(o.emergencyBucketId),
  };
}

const GROUPS = new Set<string>(["spend", "save", "set_aside"]);
export const groupOf = (key: string): BucketGroupKey => (GROUPS.has(key) ? (key as BucketGroupKey) : "set_aside");

type BucketRow = { id: string; name: string; shortName: string | null; hue: string | null; groupKey: string; note: string | null; planless: boolean; keptInAccountId: string | null };

function toBucket(b: BucketRow): PlanBucket {
  return {
    id: b.id,
    name: b.name,
    shortName: b.shortName?.trim() || b.name,
    hue: b.hue,
    groupKey: groupOf(b.groupKey),
    note: b.note,
    planless: b.planless,
    keptInAccountId: b.keptInAccountId,
    isBuiltin: isBuiltinHue(b.hue),
  };
}

const BUCKET_COLS = "id, name, shortName, hue, groupKey, note, planless, keptInAccountId, displayOrder, isArchived";

/** Everything the Split plan screen shows. RLS limits every query to the signed-in user. Throws on any error. */
export async function getSplitPlanData(client: Client, userId: string): Promise<SplitPlanData> {
  // One wave for everything that doesn't depend on another read. Only the "Now ₱X" measure needs the settings first.
  const [bucketRes, accountRes, planRes, ruleRes, lineRes, settingsRes] = await Promise.all([
    client.from("buckets").select(BUCKET_COLS).is("deletedAt", null).order("displayOrder").order("id"),
    client.from("accounts").select("id, name, isArchived").is("deletedAt", null).order("displayOrder").order("id"),
    client.from("allocation_plans").select("id, key, name").is("deletedAt", null).order("createdAt").order("key"),
    client.from("allocation_rules").select("kind, params, createdAt, id").is("deletedAt", null).order("createdAt").order("id"),
    client.from("allocation_plan_lines").select("planId, bucketId, percentBp").is("deletedAt", null),
    client.rpc("plan_settings"),
  ]);
  for (const r of [bucketRes, accountRes, planRes, ruleRes, lineRes, settingsRes]) if (r.error) throw new Error(r.error.message);

  const allBuckets = bucketRes.data ?? [];
  const buckets = allBuckets.filter((b) => !b.isArchived).map(toBucket);
  const archived = allBuckets.filter((b) => b.isArchived).map(toBucket);
  const accounts: PlanAccount[] = (accountRes.data ?? []).map((a) => ({ id: a.id, name: a.name, isArchived: a.isArchived }));

  const planRows = planRes.data ?? [];
  const plans: PlanView[] = planRows.map((p) => {
    const lines: Record<string, number> = {};
    for (const l of lineRes.data ?? []) if (l.planId === p.id) lines[l.bucketId] = l.percentBp;
    return { key: p.key, name: p.name?.trim() || `Plan ${p.key}`, lines };
  });

  const parsed = parsePlanSettings(settingsRes.data);
  const emergencyId = parsed.emergencyBucketId ?? buckets.find((b) => b.hue === "emergency")?.id ?? null;
  let nowMinor = 0;
  if (emergencyId) {
    const { data, error } = await client.rpc("engine_plan_measure", { p_user: userId, p_bucket: emergencyId });
    if (error) throw new Error(error.message);
    nowMinor = data ?? 0;
  }
  const bucketName = (id: unknown) => buckets.find((b) => b.id === id)?.name ?? null;

  let redirectRule: RedirectRule | null = null;
  const rd = (ruleRes.data ?? []).find((r) => r.kind === "redirect_until_date");
  if (rd) {
    const p = obj(rd.params);
    const until = str(p.untilDate);
    const from = bucketName(p.fromBucketId);
    const to = bucketName(p.toBucketId);
    if (until && from && to) redirectRule = { fromBucketName: from, toBucketName: to, untilDate: until };
  }

  return {
    buckets,
    archived,
    accounts,
    plans,
    settings: { ...parsed, emergencyBucketId: emergencyId, emergencyName: bucketName(emergencyId) ?? "Emergency fund", nowMinor },
    redirectRule,
  };
}
