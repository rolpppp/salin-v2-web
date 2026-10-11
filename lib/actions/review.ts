"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { failure, SAVE_FAILED, SIGNED_OUT, type ActionResult } from "./result";
import { coverFromBuffer } from "./covers";
import { createClient } from "@/lib/supabase/server";

async function session() {
  const user = await getCurrentUser();
  return user ? await createClient() : null;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Closes the week. `close_week` (SQL) computes the three checks itself, so a client can't forge them, stores the
 * `week_reviews` row and is idempotent: closing a closed week returns the stored result (`alreadyClosed`).
 * A closed week is a record and can't be reopened (SPEC §3).
 */
export async function closeWeekAction(input: { weekStart: string; observation?: string | null }): Promise<ActionResult<{ alreadyClosed: boolean; openItems: number }>> {
  const parsed = z.object({ weekStart: isoDate, observation: z.string().max(400).nullish() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: SAVE_FAILED };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { data, error } = await client.rpc("close_week", { p_week_start: parsed.data.weekStart, p_observation: parsed.data.observation ?? undefined });
    if (error) return failure(error);
    const row = data?.[0];
    if (!row) return { ok: false, error: SAVE_FAILED };
    const checks = row.check_results && typeof row.check_results === "object" && !Array.isArray(row.check_results) ? (row.check_results as Record<string, unknown>) : {};
    const openItems = (["assign", "transfers", "living"] as const).filter((k) => checks[k] !== true).length;
    if (!row.was_already_closed) await track("week_closed", { open_items_count: openItems });
    // The header's Review dot lives in the layout: refresh everything.
    revalidatePath("/", "layout");
    return { ok: true, alreadyClosed: row.was_already_closed, openItems };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

/** "Move 1% from Fun to Living" (D-18): both plans, future paydays only. Bucket ids are found server-side from their hues. */
export async function nudgeFunToLivingAction(): Promise<ActionResult<{ plans: Array<{ planKey: string; fromBp: number; toBp: number }>; fromName: string; toName: string }>> {
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { data: buckets, error: bErr } = await client.from("buckets").select("id, name, hue").is("deletedAt", null).eq("isArchived", false).in("hue", ["fun", "living"]);
    if (bErr) return failure(bErr);
    const fun = buckets?.find((b) => b.hue === "fun");
    const living = buckets?.find((b) => b.hue === "living");
    if (!fun || !living) return { ok: false, error: "Fun money or Living isn't set up. Change the split in Plans." };
    const { data, error } = await client.rpc("nudge_plan_percent", { p_from_bucket: fun.id, p_to_bucket: living.id, p_bp: 100 });
    if (error) return failure(error);
    await track("plan_edited", { field: "percent" });
    revalidatePath("/review");
    revalidatePath("/plans/split");
    return { ok: true, plans: (data ?? []).map((r) => ({ planKey: r.plan_key, fromBp: r.from_bp, toBp: r.to_bp })), fromName: fun.name, toName: living.name };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

/** "Cover from Buffer" on Review: the shared cover action, which also fires `cover_used`. */
export async function coverFromBufferAction(input: { toBucketId: string }): Promise<ActionResult<{ coveredMinor: number; stillNeedsMinor: number }>> {
  return coverFromBuffer(input);
}

/** `review_opened`: fired once per visit from the screen, not on every refresh. */
export async function trackReviewOpenedAction(weekStart: string): Promise<void> {
  if (!isoDate.safeParse(weekStart).success) return;
  await track("review_opened", { week_start: weekStart });
}
