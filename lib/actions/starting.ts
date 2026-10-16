"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import type { Json } from "@/lib/database.types";
import { amountBand } from "@/lib/data/simple-today-model";
import { MAX_MINOR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { SAVE_FAILED, SIGNED_OUT, failure, type ActionResult } from "./result";

const lines = z
  .array(z.object({ bucketId: z.guid(), accountId: z.string().min(1).max(100), amountMinor: z.number().int().positive().max(MAX_MINOR) }))
  .min(1)
  .max(60);
const move = z.object({ fromBucketId: z.guid(), toBucketId: z.guid(), amountMinor: z.number().int().positive().max(MAX_MINOR) });

export type StartBucketsLine = z.input<typeof lines>[number];

/** The SQL refusals name centavos; say what happened instead. */
function refusal(error: { code?: string; message: string }): { ok: false; error: string } {
  const msg = error.message ?? "";
  if (error.code === "P0001" && /not in a bucket yet/.test(msg)) return { ok: false, error: "Some of this money was already sorted, or the account changed. Reload the page to see what's left." };
  if (error.code === "P0001" && /left in that bucket/.test(msg)) return { ok: false, error: "That's more than is left in the bucket now. Lower the amount and try again." };
  if (error.code === "P0001" && /archived/.test(msg)) return { ok: false, error: msg };
  if (error.code === "P0001" && /pesos accounts/.test(msg)) return { ok: false, error: "Only pesos accounts can be sorted into buckets." };
  if (error.code === "P0002" && /undone/.test(msg)) return { ok: false, error: "That was already undone." };
  if (error.code === "P0002" && /not there any more/.test(msg)) return { ok: false, error: "That line is already gone." };
  if (error.code === "P0002" || error.code === "42501") return { ok: false, error: "A bucket or account isn't there any more. Reload the page and try again." };
  return failure(error);
}

function refresh() {
  revalidatePath("/today");
  revalidatePath("/plans/accounts");
  revalidatePath("/review");
}

/**
 * "Sort the money you already have" (ticket 38): gives money already sitting in the accounts to buckets. One
 * transaction (`start_buckets`); nothing moves between accounts and nothing is income. Returns the batch for Undo.
 */
export async function startBucketsAction(input: StartBucketsLine[]): Promise<ActionResult<{ batchId: string; totalMinor: number }>> {
  const parsed = lines.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the amounts and try again." };
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  if (!client) return { ok: false, error: SIGNED_OUT };
  const { data, error } = await client.rpc("start_buckets", { p_lines: parsed.data as unknown as Json });
  if (error) return refusal(error);
  const totalMinor = parsed.data.reduce((t, l) => t + l.amountMinor, 0);
  await track("starting_money_sorted", { accounts_count: new Set(parsed.data.map((l) => l.accountId)).size, amount_band: amountBand(totalMinor) });
  refresh();
  return { ok: true, batchId: String(data), totalMinor };
}

/** Right after Save: soft-deletes that batch. Allowed even if a bucket then needs money (it shows "Needs", honestly). */
export async function undoStartAction(input: { batchId: string }): Promise<ActionResult> {
  const parsed = z.object({ batchId: z.guid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: SAVE_FAILED };
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  if (!client) return { ok: false, error: SIGNED_OUT };
  const { error } = await client.rpc("unsort_start", { p_batch: parsed.data.batchId });
  if (error) return refusal(error);
  refresh();
  return { ok: true };
}

/** One starting-money line removed from a bucket's history. */
export async function removeStartAction(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: z.guid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: SAVE_FAILED };
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  if (!client) return { ok: false, error: SIGNED_OUT };
  const { error } = await client.rpc("remove_start", { p_id: parsed.data.id });
  if (error) return refusal(error);
  refresh();
  return { ok: true };
}

/**
 * Move money from one bucket to another (a cover with note 'move'). Capped at what the bucket has left, re-checked
 * under a lock in the database. Nothing moves between accounts; the sheet tells the person when their apps need it.
 */
export async function moveBetweenBucketsAction(input: { fromBucketId: string; toBucketId: string; amountMinor: number }): Promise<ActionResult> {
  const parsed = move.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter an amount above zero." };
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  if (!client) return { ok: false, error: SIGNED_OUT };
  const { fromBucketId, toBucketId, amountMinor } = parsed.data;
  const { error } = await client.rpc("move_between_buckets", { p_from: fromBucketId, p_to: toBucketId, p_amount: amountMinor });
  if (error) return refusal(error);
  const { data } = await client.from("buckets").select("id, hue, keptInAccountId").in("id", [fromBucketId, toBucketId]);
  const from = data?.find((b) => b.id === fromBucketId);
  const to = data?.find((b) => b.id === toBucketId);
  await track("bucket_moved", {
    from_bucket: from?.hue ?? "other",
    to_bucket: to?.hue ?? "other",
    across_accounts: (from?.keptInAccountId ?? null) !== (to?.keptInAccountId ?? null),
  });
  refresh();
  return { ok: true };
}
