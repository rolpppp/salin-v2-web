"use server";

import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { MAX_MINOR } from "@/lib/money";
import { failure, SAVE_FAILED, SIGNED_OUT, type ActionResult } from "./result";

const planLines = z
  .array(z.object({ bucketId: z.guid(), percentBp: z.number().int().min(0).max(10000) }))
  .min(1)
  .max(50);

async function session() {
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  return client ? client : null;
}

/**
 * Saves one plan's percentages in a single transaction. The plan must total exactly 100% (10000 bp) or nothing
 * is written and the last valid version stays active. Only affects paydays confirmed after the save.
 */
export async function saveSplitPlan(planKey: string, lines: Array<{ bucketId: string; percentBp: number }>): Promise<ActionResult> {
  const parsed = planLines.safeParse(lines);
  if (!parsed.success || !/^[A-Z]$/.test(planKey)) return { ok: false, error: "Use whole percentages from 0 to 100." };
  const total = parsed.data.reduce((s, l) => s + l.percentBp, 0);
  if (total !== 10000) return { ok: false, error: `Plan ${planKey} adds up to ${total / 100}%. It must add up to 100% to be saved.` };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await client.rpc("save_plan_lines", { p_plan_key: planKey, p_lines: parsed.data });
    if (error) return failure(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "percent" });
  return { ok: true };
}

/** Changes where a bucket is kept. Applies to money confirmed from now on; past paydays keep their destination. */
export async function setBucketKeptIn(bucketId: string, accountId: string): Promise<ActionResult> {
  if (!z.guid().safeParse(bucketId).success || accountId.length < 1 || accountId.length > 100) return { ok: false, error: SAVE_FAILED };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await client.rpc("set_bucket_kept_in", { p_bucket: bucketId, p_account: accountId });
    if (error) return failure(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "kept_in" });
  return { ok: true };
}

/** The Plan B switch amount, in centavos. It is also the Emergency goal's target, so both change together. */
export async function setPlanSwitchTarget(targetMinor: number): Promise<ActionResult> {
  if (!Number.isSafeInteger(targetMinor) || targetMinor < 1 || targetMinor > MAX_MINOR) {
    return { ok: false, error: "Enter an amount above ₱0 and up to ₱10,000,000." };
  }
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await client.rpc("set_plan_switch_target", { p_target_minor: targetMinor });
    if (error) return failure(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "target" });
  return { ok: true };
}
