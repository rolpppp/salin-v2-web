import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { goalProgressBp } from "@/lib/money";

type Client = SupabaseClient<Database>;

export type GoalView = {
  id: string;
  name: string;
  targetMinor: number;
  currency: string;
  savedMinor: number;
  /** 0..10000, floored (BR 7.1). */
  progressBp: number;
  linkedBucketId: string | null;
  linkedShareBp: number;
  isPlanSwitch: boolean;
  /** "Fed from 50% of Sinking" or "Not linked to a bucket yet". */
  feed: string;
};

export type GoalsData = {
  goals: GoalView[];
  archived: { id: string; name: string }[];
  buckets: { id: string; name: string }[];
};

type Flows = { allocated: number; left: number };

/**
 * BR 7.1: Emergency (the Plan B switch goal) saved = its bucket's left amount; other goals = their share of
 * the linked bucket's allocations (PC Build = 50% of Sinking); unlinked goals start at 0. Integer floor, never
 * negative (a goal can't have saved less than nothing).
 */
export function goalSaved(g: { isPlanSwitch: boolean; linkedShareBp: number }, flows: Flows | null): number {
  if (!flows) return 0;
  const basis = g.isPlanSwitch ? flows.left : flows.allocated;
  if (basis <= 0) return 0;
  return Number((BigInt(basis) * BigInt(g.linkedShareBp)) / 10_000n);
}

export function feedText(bucketName: string | null, shareBp: number): string {
  if (!bucketName) return "Not linked to a bucket yet";
  if (shareBp >= 10_000) return `Fed from all of ${bucketName}`;
  return `Fed from ${shareBp % 100 === 0 ? shareBp / 100 : (shareBp / 100).toFixed(2)}% of ${bucketName}`;
}

export function buildGoals(args: {
  goals: Array<{ id: string; name: string; targetMinor: number; currency: string; linkedBucketId: string | null; linkedShareBp: number; isPlanSwitch: boolean }>;
  buckets: Array<{ id: string; name: string }>;
  flows: Map<string, Flows>;
}): GoalView[] {
  const names = new Map(args.buckets.map((b) => [b.id, b.name]));
  return args.goals.map((g) => {
    const savedMinor = goalSaved(g, g.linkedBucketId ? (args.flows.get(g.linkedBucketId) ?? null) : null);
    return {
      ...g,
      savedMinor,
      progressBp: g.targetMinor > 0 ? goalProgressBp(savedMinor, g.targetMinor) : 0,
      feed: feedText(g.linkedBucketId ? (names.get(g.linkedBucketId) ?? null) : null, g.linkedShareBp),
    };
  });
}

export async function getGoalsData(client: Client): Promise<GoalsData> {
  const [goalsRes, bucketsRes, leftRes] = await Promise.all([
    client
      .from("goals")
      .select("id, name, targetMinor, currency, linkedBucketId, linkedShareBp, isPlanSwitch, isArchived, createdAt")
      .is("deletedAt", null)
      .order("createdAt")
      .order("id"),
    client.from("buckets").select("id, name").is("deletedAt", null).eq("isArchived", false).order("displayOrder").order("id"),
    client.rpc("bucket_left"),
  ]);
  for (const r of [goalsRes, bucketsRes, leftRes]) if (r.error) throw new Error(r.error.message);
  const all = goalsRes.data ?? [];
  const buckets = bucketsRes.data ?? [];
  const flows = new Map((leftRes.data ?? []).map((l) => [l.bucket_id, { allocated: l.allocated, left: l.left_minor }]));
  return {
    goals: buildGoals({ goals: all.filter((g) => !g.isArchived), buckets, flows }),
    archived: all.filter((g) => g.isArchived).map((g) => ({ id: g.id, name: g.name })),
    buckets,
  };
}

/** Centavos as the text a person edits: `5000000` -> `50,000`, `5000050` -> `50,000.50`. Integer math only. */
export function minorToInput(minor: number): string {
  const abs = Math.abs(minor);
  const pesos = Math.floor(abs / 100);
  const cents = abs - pesos * 100;
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${minor < 0 ? "-" : ""}${grouped}${cents ? `.${String(cents).padStart(2, "0")}` : ""}`;
}
