"use server";

import { revalidatePath } from "next/cache";
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

const planKeySchema = z.string().regex(/^[A-Za-z0-9_]{1,12}$/);
const nameSchema = z.string().trim().min(1).max(40);
const groupSchema = z.enum(["spend", "save", "set_aside"]);
const hueSchema = z.string().regex(/^c[1-8]$/);

async function session() {
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  return client ? client : null;
}

/**
 * Refusals (P0001) and bad-input errors carry a sentence written for people ("Emergency fund can't be archived
 * because ..."): show them verbatim. Anything else is a generic failure.
 */
function refusal(error: { code?: string; message: string }): { ok: false; error: string } {
  if (error.code === "P0001" && error.message.trim()) return { ok: false, error: error.message.trim() };
  return failure(error);
}

/** Plan and bucket changes show up on Today, Money in, Review and Plans. */
function refresh() {
  revalidatePath("/plans/split");
  revalidatePath("/", "layout");
}

/**
 * Saves one plan's percentages in a single transaction. The plan must total exactly 100% (10000 bp) or nothing
 * is written and the last valid version stays active. Only affects paydays confirmed after the save.
 */
export async function saveSplitPlan(planKey: string, lines: Array<{ bucketId: string; percentBp: number }>): Promise<ActionResult> {
  const parsed = planLines.safeParse(lines);
  if (!parsed.success || !planKeySchema.safeParse(planKey).success) return { ok: false, error: "Use whole percentages from 0 to 100." };
  const total = parsed.data.reduce((s, l) => s + l.percentBp, 0);
  if (total !== 10000) return { ok: false, error: `This plan adds up to ${total / 100}%. It must add up to 100% to be saved.` };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await client.rpc("save_plan_lines", { p_plan_key: planKey, p_lines: parsed.data });
    if (error) return refusal(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "percent" });
  refresh();
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
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- Plans v2 (ticket 26)

/**
 * Creates a plan. `lines` (from a from-scratch draft) must total 100%; `copyFrom` copies that plan's lines.
 * Returns the new plan's key.
 */
export async function createPlan(input: { name: string; lines?: Array<{ bucketId: string; percentBp: number }>; copyFrom?: string }): Promise<ActionResult<{ key: string }>> {
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Give the plan a name of 1 to 40 characters." };
  let args: { p_name: string; p_lines: z.infer<typeof planLines> | null; p_copy_from?: string };
  if (input.copyFrom !== undefined) {
    if (!planKeySchema.safeParse(input.copyFrom).success) return { ok: false, error: SAVE_FAILED };
    args = { p_name: name.data, p_lines: null, p_copy_from: input.copyFrom };
  } else {
    const lines = planLines.safeParse(input.lines);
    if (!lines.success) return { ok: false, error: "Use whole percentages from 0 to 100." };
    const total = lines.data.reduce((s, l) => s + l.percentBp, 0);
    if (total !== 10000) return { ok: false, error: `This plan adds up to ${total / 100}%. It must add up to 100% to be saved.` };
    args = { p_name: name.data, p_lines: lines.data };
  }
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { data, error } = await client.rpc("create_plan", args);
    if (error) return refusal(error);
    if (!data) return { ok: false, error: SAVE_FAILED };
    await track("plan_edited", { field: "plan" });
    refresh();
    return { ok: true, key: data };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function renamePlan(planKey: string, name: string): Promise<ActionResult> {
  const n = nameSchema.safeParse(name);
  if (!n.success || !planKeySchema.safeParse(planKey).success) return { ok: false, error: "Give the plan a name of 1 to 40 characters." };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await client.rpc("rename_plan", { p_plan_key: planKey, p_name: n.data });
    if (error) return refusal(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "plan" });
  refresh();
  return { ok: true };
}

/** Soft delete. Refused (with the reason as the error) for the active plan, either automatic plan, or the last plan. */
export async function deletePlan(planKey: string): Promise<ActionResult> {
  if (!planKeySchema.safeParse(planKey).success) return { ok: false, error: SAVE_FAILED };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await client.rpc("delete_plan", { p_plan_key: planKey });
    if (error) return refusal(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "plan" });
  refresh();
  return { ok: true };
}

export type ActivePlanInput = { mode: "manual"; planKey: string } | { mode: "auto"; from: string; to: string };

/** Which plan splits paydays: one chosen plan, or the automatic switch from one plan to another. Future paydays only. */
export async function setActivePlan(input: ActivePlanInput): Promise<ActionResult> {
  if (input.mode === "manual" ? !planKeySchema.safeParse(input.planKey).success : !planKeySchema.safeParse(input.from).success || !planKeySchema.safeParse(input.to).success) {
    return { ok: false, error: SAVE_FAILED };
  }
  if (input.mode === "auto" && input.from === input.to) return { ok: false, error: "Pick two different plans for the automatic switch." };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const args = input.mode === "manual" ? { p_mode: "manual", p_plan_key: input.planKey } : { p_mode: "auto", p_from: input.from, p_to: input.to };
    const { error } = await client.rpc("set_active_plan", args);
    if (error) return refusal(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "active_plan" });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- buckets

export type BucketGroup = z.infer<typeof groupSchema>;

/** Adds a bucket at 0% in every plan. `hue` is a palette colour c1..c8; `keptIn` an optional account id. */
export async function createBucket(input: { name: string; group: BucketGroup; hue: string; keptIn?: string | null }): Promise<ActionResult<{ id: string }>> {
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Give the bucket a name of 1 to 40 characters." };
  if (!groupSchema.safeParse(input.group).success || !hueSchema.safeParse(input.hue).success) return { ok: false, error: SAVE_FAILED };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { data, error } = await client.rpc("create_bucket", { p_name: name.data, p_group: input.group, p_hue: input.hue, ...(input.keptIn ? { p_kept_in: input.keptIn } : {}) });
    if (error) return refusal(error);
    if (!data) return { ok: false, error: SAVE_FAILED };
    await track("plan_edited", { field: "bucket" });
    refresh();
    return { ok: true, id: data };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Edits a bucket's name, short name, group and colour. A built-in's colour can't change (the server refuses). */
export async function updateBucket(input: { id: string; name: string; shortName: string; group: BucketGroup; hue: string }): Promise<ActionResult> {
  const name = nameSchema.safeParse(input.name);
  const short = z.string().trim().max(20).safeParse(input.shortName);
  if (!z.guid().safeParse(input.id).success || !groupSchema.safeParse(input.group).success || !/^[a-z][a-z0-9]{1,19}$/.test(input.hue)) return { ok: false, error: SAVE_FAILED };
  if (!name.success) return { ok: false, error: "Give the bucket a name of 1 to 40 characters." };
  if (!short.success) return { ok: false, error: "A short name can be up to 20 characters." };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await client.rpc("update_bucket", { p_bucket: input.id, p_name: name.data, p_short_name: short.data || name.data, p_group: input.group, p_hue: input.hue });
    if (error) return refusal(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "bucket" });
  refresh();
  return { ok: true };
}

/** Why a bucket can't be archived yet, in plain language, or `reason: null` when it can. Asked before archiving. */
export async function bucketArchiveReason(bucketId: string): Promise<ActionResult<{ reason: string | null }>> {
  if (!z.guid().safeParse(bucketId).success) return { ok: false, error: SAVE_FAILED };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { data, error } = await client.rpc("bucket_archive_reason", { p_bucket: bucketId });
    if (error) return refusal(error);
    return { ok: true, reason: data && data.trim() ? data.trim() : null };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function archiveBucket(bucketId: string): Promise<ActionResult> {
  if (!z.guid().safeParse(bucketId).success) return { ok: false, error: SAVE_FAILED };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await client.rpc("archive_bucket", { p_bucket: bucketId });
    if (error) return refusal(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "bucket" });
  refresh();
  return { ok: true };
}

/** Puts an archived bucket back at 0% in every plan. */
export async function restoreBucket(bucketId: string): Promise<ActionResult> {
  if (!z.guid().safeParse(bucketId).success) return { ok: false, error: SAVE_FAILED };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await client.rpc("restore_bucket", { p_bucket: bucketId });
    if (error) return refusal(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  await track("plan_edited", { field: "bucket" });
  refresh();
  return { ok: true };
}
