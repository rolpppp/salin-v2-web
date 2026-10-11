import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { WeekStart } from "@/lib/domain/enums";
import { zonedParts, weekRange } from "@/lib/time";
import type { IsoDate } from "@/lib/money";
import type { ClosedWeek, ReviewBucket, ReviewData, ReviewCategory, SourceLine } from "./review-model";

type Client = SupabaseClient<Database>;

const iso = (ms: number, tz: string): IsoDate => {
  const p = zonedParts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? ([] as unknown)) as T;
}

const asSources = (j: Json): SourceLine[] =>
  Array.isArray(j)
    ? j.flatMap((x) => {
        if (!x || typeof x !== "object" || Array.isArray(x)) return [];
        const o = x as Record<string, Json | undefined>;
        return typeof o.name === "string" && typeof o.amountMinor === "number" ? [{ name: o.name, amountMinor: o.amountMinor }] : [];
      })
    : [];

const asChecks = (j: Json): ClosedWeek["checks"] => {
  const o = j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, Json | undefined>) : {};
  return { assign: o.assign === true, transfers: o.transfers === true, living: o.living === true };
};

/**
 * Everything Review needs for the current week. SQL does the arithmetic (`bucket_left`, `week_slip_figures`,
 * `week_bucket_flows`, `week_category_spend`, `transfer_plan`, `tab_badges`); this only reads and reshapes.
 * RLS limits every query to the signed-in user. Throws on any error so the page can say it couldn't load.
 */
export async function getReviewData(client: Client, opts: { userId: string; nowMs: number; timeZone: string }): Promise<ReviewData> {
  const { timeZone: tz, nowMs } = opts;
  const profileRes = await client.from("user_profiles").select("firstName, weekStartsOn, reviewDay, deletedAt").eq("user_id", opts.userId).maybeSingle();
  if (profileRes.error) throw new Error(profileRes.error.message);
  const p = profileRes.data && profileRes.data.deletedAt === null ? profileRes.data : null;
  const weekStartsOn: 0 | 1 = p?.weekStartsOn === WeekStart.sunday ? 0 : 1;
  const reviewDay = p?.reviewDay ?? 0;

  const week = weekRange(nowMs, tz, weekStartsOn);
  const last = weekRange(week.startMs - 1, tz, weekStartsOn);
  const weekStart = iso(week.startMs, tz);
  const weekEnd = iso(week.endMs - 1, tz);
  const todayIso = iso(nowMs, tz);

  const [bucketRows, leftRows, flowRows, lastFlowRows, figuresRows, catRows, transferRows, badgeRows, reviewRes, allocAny, goalRows, planKeyRes] = await Promise.all([
    client.from("buckets").select("id, name, shortName, groupKey, hue, isArchived, displayOrder").is("deletedAt", null).order("displayOrder").order("id"),
    client.rpc("bucket_left"),
    client.rpc("week_bucket_flows", { p_from: week.startMs, p_to: week.endMs }),
    client.rpc("week_bucket_flows", { p_from: last.startMs, p_to: last.endMs }),
    client.rpc("week_slip_figures", { p_from: week.startMs }),
    client.rpc("week_category_spend", { p_from: week.startMs, p_to: week.endMs }),
    client.rpc("transfer_plan"),
    client.rpc("tab_badges", { p_today: todayIso }),
    client.from("week_reviews").select("checks, safeToSpendMinor, observation, closedAt").eq("weekStart", weekStart).is("deletedAt", null).maybeSingle(),
    client.from("allocations").select("id").is("deletedAt", null).limit(1),
    client.from("goals").select("targetMinor").eq("isPlanSwitch", true).is("deletedAt", null).order("createdAt").limit(1),
    client.rpc("active_plan"),
  ]);

  const buckets = must(bucketRows);
  const lefts = new Map(must(leftRows).map((l) => [l.bucket_id, l.left_minor]));
  const flows = new Map(must(flowRows).map((f) => [f.bucket_id, f]));
  const lastFlows = new Map(must(lastFlowRows).map((f) => [f.bucket_id, f]));
  const figures = must(figuresRows)[0];
  if (!figures) throw new Error("week_slip_figures returned nothing");
  const transfers = must(transferRows);
  const badge = must(badgeRows)[0];
  must(allocAny);
  const goal = must(goalRows)[0];
  if (reviewRes.error) throw new Error(reviewRes.error.message);
  const activeKey = planKeyRes.error ? null : (planKeyRes.data as string | null);

  const reviewBuckets: ReviewBucket[] = buckets.map((b) => ({
    id: b.id,
    name: b.name,
    shortName: b.shortName,
    groupKey: b.groupKey,
    hue: b.hue,
    isArchived: b.isArchived,
    leftMinor: lefts.get(b.id) ?? 0,
    spentWeekMinor: flows.get(b.id)?.spent_minor ?? 0,
    coversInWeekMinor: flows.get(b.id)?.covers_in_minor ?? 0,
    changeWeekMinor: flows.get(b.id)?.change_minor ?? 0,
    changeLastWeekMinor: lastFlows.get(b.id)?.change_minor ?? 0,
  }));

  const categories: ReviewCategory[] = must(catRows).map((c) => ({ bucketId: c.bucket_id, name: c.category_name ?? "Uncategorised", amountMinor: c.amount_minor }));

  // Living's share in the plan that applies to the next payday (a nudge raises it by one point).
  let livingPlanBp: number | null = null;
  const living = buckets.find((b) => b.hue === "living");
  if (living && activeKey) {
    const plan = await client.from("allocation_plans").select("id").eq("key", activeKey).is("deletedAt", null).maybeSingle();
    if (plan.data) {
      const line = await client.from("allocation_plan_lines").select("percentBp").eq("planId", plan.data.id).eq("bucketId", living.id).is("deletedAt", null).maybeSingle();
      livingPlanBp = line.data?.percentBp ?? null;
    }
  }

  const emergency = buckets.find((b) => b.hue === "emergency") ?? null;
  const closedRow = reviewRes.data;
  const closed: ClosedWeek | null = closedRow
    ? { checks: asChecks(closedRow.checks), safeToSpendMinor: closedRow.safeToSpendMinor, observation: closedRow.observation, closedDateIso: iso(closedRow.closedAt, tz) }
    : null;

  return {
    firstName: p?.firstName ?? null,
    weekStart,
    weekEnd,
    weekStartsOn,
    reviewDay,
    todayIso,
    buckets: reviewBuckets,
    categories,
    sources: asSources(figures.sources),
    cameInWeekMinor: figures.came_in_week - figures.carried_in,
    carriedInMinor: figures.carried_in,
    spentWeekMinor: figures.spent_week,
    toAssignMinor: figures.to_assign,
    hasHistory: figures.has_history,
    waitingCount: badge?.waiting_count ?? 0,
    anyConfirmed: (allocAny.data?.length ?? 0) > 0,
    pendingTransfers: transfers.filter((t) => t.kind === "transfer" && !t.done).length,
    livingPlanBp,
    emergency: {
      bucketId: emergency?.id ?? null,
      savedMinor: emergency ? (lefts.get(emergency.id) ?? 0) : 0,
      targetMinor: goal?.targetMinor ?? null,
    },
    closed,
  };
}
