"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { coverFromBuffer as planCover } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { SAVE_FAILED, SIGNED_OUT, failure, type ActionResult } from "./result";

const input = z.object({ toBucketId: z.string().min(1).max(100) });

const NO_BUFFER = "You don't have a Buffer bucket to cover from. Add one in Plans, then try again.";

/**
 * Cover from Buffer (BR §4.3, D-19): moves `min(deficit, left(Buffer))` from Buffer into the overspent bucket as a
 * cover record. Both numbers are read from `bucket_left` here, on the server, at the moment of the click, so a stale
 * screen can't move the wrong amount; `cover_bucket` re-checks Buffer's balance under a lock. If Buffer can't cover
 * all of it, covers what is there and says how much is still needed. Never moves money by itself and never fails
 * silently: an already-covered bucket returns `coveredMinor: 0, stillNeedsMinor: 0`.
 *
 * Ticket 14 (Review) imports this exact signature.
 */
export async function coverFromBuffer(input_: { toBucketId: string }): Promise<ActionResult<{ coveredMinor: number; stillNeedsMinor: number }>> {
  const parsed = input.safeParse(input_);
  if (!parsed.success) return { ok: false, error: SAVE_FAILED };
  const { toBucketId } = parsed.data;

  const supabase = await createClient();
  const user = supabase ? await getCurrentUser() : null;
  if (!supabase || !user) return { ok: false, error: SIGNED_OUT };

  const [bucketsRes, leftRes] = await Promise.all([
    supabase.from("buckets").select("id, hue, displayOrder").is("deletedAt", null).order("displayOrder").order("id"),
    supabase.rpc("bucket_left"),
  ]);
  if (bucketsRes.error || leftRes.error) {
    console.error("[covers] read failed", bucketsRes.error?.message ?? leftRes.error?.message);
    return { ok: false, error: SAVE_FAILED };
  }
  const buckets = bucketsRes.data ?? [];
  const to = buckets.find((b) => b.id === toBucketId);
  if (!to) return failure({ code: "P0002", message: "bucket not found" });
  const buffer = buckets.find((b) => b.hue === "buffer" && b.id !== toBucketId);
  if (!buffer) return { ok: false, error: NO_BUFFER };

  const leftOf = (id: string) => (leftRes.data ?? []).find((l) => l.bucket_id === id)?.left_minor ?? 0;
  const { cover, stillNeeded } = planCover(leftOf(to.id), leftOf(buffer.id));
  if (cover <= 0) return { ok: true, coveredMinor: 0, stillNeedsMinor: stillNeeded };

  const { error } = await supabase.rpc("cover_bucket", { p_from: buffer.id, p_to: to.id, p_amount: cover });
  if (error) {
    console.error("[covers] cover failed", error.code, error.message);
    return failure(error);
  }

  await track("cover_used", { from_bucket: buffer.hue ?? "buffer", to_bucket: to.hue ?? "other" });
  revalidatePath("/today");
  revalidatePath("/review");
  return { ok: true, coveredMinor: cover, stillNeedsMinor: stillNeeded };
}
