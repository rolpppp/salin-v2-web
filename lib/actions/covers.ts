"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { coverFromBuffer as coverOffer } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { failure, SAVE_FAILED, SIGNED_OUT, type ActionResult } from "./result";

const input = z.object({ toBucketId: z.guid() });

/**
 * Cover an overspent bucket from Buffer (BR 4.3, D-19). The amount is decided HERE, from the database:
 * `min(deficit, left(Buffer))`, so a stale or forged client can't move the wrong sum. If Buffer can't cover it
 * all, the cover is whatever is there and `stillNeedsMinor` names the rest (the person picks another bucket).
 * A bucket that isn't overspent, or an empty Buffer, covers 0 and changes nothing. Never moves money by itself:
 * it only runs when the person presses "Cover from Buffer".
 */
export async function coverFromBuffer(raw: { toBucketId: string }): Promise<ActionResult<{ coveredMinor: number; stillNeedsMinor: number }>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: SAVE_FAILED };
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  if (!client) return { ok: false, error: SIGNED_OUT };
  const to = parsed.data.toBucketId;

  try {
    const [left, buckets] = await Promise.all([
      client.rpc("bucket_left"),
      client.from("buckets").select("id, hue").is("deletedAt", null),
    ]);
    if (left.error) return failure(left.error);
    if (buckets.error) return failure(buckets.error);
    const buffer = (buckets.data ?? []).find((b) => b.hue === "buffer");
    if (!buffer) return { ok: false, error: "There is no Buffer bucket to cover from." };
    if (buffer.id === to) return { ok: false, error: "Buffer can't cover itself." };
    const leftOf = (id: string) => (left.data ?? []).find((l) => l.bucket_id === id)?.left_minor;
    const target = leftOf(to);
    if (target === undefined) return { ok: false, error: "That bucket isn't available any more. Reload the page and try again." };

    const offer = coverOffer(target, leftOf(buffer.id) ?? 0);
    if (offer.cover > 0) {
      const { error } = await client.rpc("cover_bucket", { p_from: buffer.id, p_to: to, p_amount: offer.cover });
      if (error) return failure(error);
      revalidatePath("/review");
      revalidatePath("/today");
    }
    return { ok: true, coveredMinor: offer.cover, stillNeedsMinor: offer.stillNeeded };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}
