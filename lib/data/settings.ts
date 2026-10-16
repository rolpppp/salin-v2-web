import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isRhythm, type Rhythm } from "@/lib/settings/model";
import { groupOf, parsePlanSettings } from "./plans";
import { keepBucketIdOf } from "./simple-today-model";

type Client = SupabaseClient<Database>;

export type SettingsBucket = {
  id: string;
  name: string;
  hue: string | null;
  groupKey: string;
  isArchived: boolean;
  /** Share of a payday in the active plan, in basis points; null when there is no plan or the bucket is planless. */
  sharePercentBp: number | null;
};

export type SettingsData = {
  firstName: string | null;
  weekStartsOn: 0 | 1;
  reviewDay: number;
  viewMode: "simple" | "full";
  pay: { amountMinor: number | null; rhythm: Rhythm | null; nextDate: string | null };
  spendUntil: string | null;
  /** The bucket "kept aside" goes to right now: the saved pick, else what Simple Today falls back to. */
  keepBucketId: string | null;
  /** True when keepBucketId is the saved pick (not the fallback). */
  keepBucketSaved: boolean;
  buckets: SettingsBucket[];
  activePlanName: string | null;
  planMode: "plan" | "track";
};

/** Everything Settings shows, read in one wave. RLS limits every query to the signed-in user. Throws on any error. */
export async function getSettingsData(client: Client, userId: string): Promise<SettingsData> {
  const [profileRes, bucketRes, planRes, lineRes, settingsRes] = await Promise.all([
    client
      .from("user_profiles")
      .select("firstName, weekStartsOn, reviewDay, viewMode, payAmountMinor, payRhythm, nextPaydayDate, spendUntil, keepBucketId, planMode, deletedAt")
      .eq("user_id", userId)
      .maybeSingle(),
    client.from("buckets").select("id, name, hue, groupKey, isArchived, planless, displayOrder").is("deletedAt", null).order("displayOrder").order("id"),
    client.from("allocation_plans").select("id, key, name").is("deletedAt", null),
    client.from("allocation_plan_lines").select("planId, bucketId, percentBp").is("deletedAt", null),
    client.rpc("plan_settings"),
  ]);
  for (const r of [profileRes, bucketRes, planRes, lineRes]) if (r.error) throw new Error(r.error.message);
  const p = profileRes.data;
  if (!p || p.deletedAt !== null) throw new Error("No profile yet");

  const plans = planRes.data ?? [];
  const activeKey = settingsRes.error ? "A" : parsePlanSettings(settingsRes.data).activeKey;
  const active = plans.find((pl) => pl.key === activeKey) ?? plans[0] ?? null;
  const shares = new Map<string, number>();
  if (active) for (const l of lineRes.data ?? []) if (l.planId === active.id) shares.set(l.bucketId, l.percentBp);

  const live = (bucketRes.data ?? []).filter((b) => !b.isArchived);
  const buckets: SettingsBucket[] = live.map((b) => ({
    id: b.id,
    name: b.name,
    hue: b.hue,
    groupKey: b.groupKey,
    isArchived: b.isArchived,
    sharePercentBp: active && !b.planless ? (shares.get(b.id) ?? 0) : null,
  }));
  const keep = keepBucketIdOf(live.map((b) => ({ id: b.id, name: b.name, groupKey: groupOf(b.groupKey), hue: b.hue, displayOrder: b.displayOrder })), p.keepBucketId);

  return {
    firstName: p.firstName,
    weekStartsOn: p.weekStartsOn === 0 ? 0 : 1,
    reviewDay: p.reviewDay,
    viewMode: p.viewMode === "simple" ? "simple" : "full",
    pay: { amountMinor: p.payAmountMinor, rhythm: isRhythm(p.payRhythm) ? p.payRhythm : null, nextDate: p.nextPaydayDate },
    spendUntil: p.spendUntil,
    keepBucketId: keep || null,
    keepBucketSaved: p.keepBucketId !== null && keep === p.keepBucketId,
    buckets,
    activePlanName: active ? active.name?.trim() || `Plan ${active.key}` : null,
    planMode: p.planMode === "track" ? "track" : "plan",
  };
}
