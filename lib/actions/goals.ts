"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { requireUser } from "@/lib/auth/session";
import { MAX_MINOR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, SAVE_FAILED, type ActionResult } from "./planResult";

const nameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "Add a name for the goal.").refine((s) => [...s].length <= 60, "Use 60 characters or fewer."));
const targetSchema = z
  .number({ error: "Enter a target amount." })
  .int("Enter a whole number of centavos.")
  .positive("The target must be more than ₱0.")
  .max(MAX_MINOR, "That target is too large.");
const shareSchema = z.number().int().min(0).max(10_000, "A share can be at most 100%.");
const bucketSchema = z.uuid().nullable();
const idSchema = z.uuid();

const PATH = "/plans/goals";
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the details and try again.";

export async function addGoalAction(input: { name: string; targetMinor: number; bucketId: string | null; shareBp: number }): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ name: nameSchema, targetMinor: targetSchema, bucketId: bucketSchema, shareBp: shareSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { data, error } = await client.rpc("add_goal", {
      p_name: parsed.data.name,
      p_target: parsed.data.targetMinor,
      p_bucket: parsed.data.bucketId ?? undefined,
      p_share_bp: parsed.data.shareBp,
    });
    if (error) return { ok: false, error: dbFailure(error) };
    revalidatePath(PATH);
    return { ok: true, value: { id: data } };
  } catch (err) {
    console.error("[goals] add failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/**
 * Edits any of name / target / link / share. The current row is read server-side and merged, so two quick
 * edits never overwrite each other with stale values. `update_goal` keeps the Plan B switch rule in step
 * when this is the switch goal (BR 7.2).
 */
export async function updateGoalAction(input: {
  id: string;
  name?: string;
  targetMinor?: number;
  bucketId?: string | null;
  shareBp?: number;
}): Promise<ActionResult> {
  const parsed = z
    .object({ id: idSchema, name: nameSchema.optional(), targetMinor: targetSchema.optional(), bucketId: bucketSchema.optional(), shareBp: shareSchema.optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const cur = await client
      .from("goals")
      .select("name, targetMinor, linkedBucketId, linkedShareBp")
      .eq("id", parsed.data.id)
      .is("deletedAt", null)
      .maybeSingle();
    if (cur.error) return { ok: false, error: dbFailure(cur.error) };
    if (!cur.data) return { ok: false, error: dbFailure({ code: "P0002" }) };
    const next = {
      name: parsed.data.name ?? cur.data.name,
      target: parsed.data.targetMinor ?? cur.data.targetMinor,
      bucket: parsed.data.bucketId === undefined ? cur.data.linkedBucketId : parsed.data.bucketId,
      share: parsed.data.shareBp ?? cur.data.linkedShareBp,
    };
    const { error } = await client.rpc("update_goal", {
      p_goal: parsed.data.id,
      p_name: next.name,
      p_target: next.target,
      p_bucket: next.bucket as string,
      p_share_bp: next.share,
    });
    if (error) return { ok: false, error: dbFailure(error) };
    if (parsed.data.targetMinor !== undefined && parsed.data.targetMinor !== cur.data.targetMinor) await track("plan_edited", { field: "target" });
    revalidatePath(PATH);
    revalidatePath("/plans/split");
    return { ok: true };
  } catch (err) {
    console.error("[goals] update failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function archiveGoalAction(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { error } = await client.rpc("archive_goal", { p_goal: parsed.data.id });
    if (error) return { ok: false, error: dbFailure(error) };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    console.error("[goals] archive failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function restoreGoalAction(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { error } = await client.rpc("restore_goal", { p_goal: parsed.data.id });
    if (error) return { ok: false, error: dbFailure(error) };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    console.error("[goals] restore failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
