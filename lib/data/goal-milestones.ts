import type { SupabaseClient } from "@supabase/supabase-js";
import { track } from "@/lib/analytics";
import type { Database } from "@/lib/database.types";
import { milestonesCrossed, type Milestone } from "@/lib/money";
import { getGoalsData } from "./goals";

/** What `goal_milestone_passed` needs about a goal at one moment. No names or amounts leave the server. */
export type GoalSnapshot = { id: string; savedMinor: number; targetMinor: number; kind: "emergency" | "custom" };

export type MilestoneCrossing = { goalKind: GoalSnapshot["kind"]; milestone: Milestone };

/**
 * Milestones (25 / 50 / 75 / 100) crossed between two snapshots, per goal, each once (BR 7.3).
 * Goals that only exist in `after` count from zero saved; goals that vanished are ignored; a goal with no
 * target can't cross anything. Pure: the actions pass in what they read before and after a user action.
 */
export function crossingsBetween(before: ReadonlyArray<GoalSnapshot>, after: ReadonlyArray<GoalSnapshot>): MilestoneCrossing[] {
  const prev = new Map(before.map((g) => [g.id, g.savedMinor]));
  const out: MilestoneCrossing[] = [];
  for (const g of after) {
    if (g.targetMinor <= 0) continue;
    for (const m of milestonesCrossed(prev.get(g.id) ?? 0, g.savedMinor, g.targetMinor)) out.push({ goalKind: g.kind, milestone: m });
  }
  return out;
}

type Client = SupabaseClient<Database>;

export async function snapshotGoals(client: Client): Promise<GoalSnapshot[]> {
  const { goals } = await getGoalsData(client);
  return goals.map((g) => ({ id: g.id, savedMinor: g.savedMinor, targetMinor: g.targetMinor, kind: g.isPlanSwitch ? "emergency" : "custom" }));
}

/** Never throws and never blocks the user's action: a failed snapshot only means no analytics event. */
export async function snapshotGoalsSafe(client: Client): Promise<GoalSnapshot[] | null> {
  try {
    return await snapshotGoals(client);
  } catch (err) {
    console.error("[goals] snapshot failed", err);
    return null;
  }
}

/**
 * Fires `goal_milestone_passed` for each milestone a user action crossed, comparing the snapshot taken before the
 * action with one taken after. Called from server actions only, so a render or refresh can never fire it.
 */
export async function trackMilestonesAfter(client: Client, before: GoalSnapshot[] | null): Promise<void> {
  if (!before) return;
  const after = await snapshotGoalsSafe(client);
  if (!after) return;
  for (const c of crossingsBetween(before, after)) {
    await track("goal_milestone_passed", { goal_kind: c.goalKind, milestone: c.milestone });
  }
}
