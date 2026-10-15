"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import type { Json } from "@/lib/database.types";
import { MAX_MINOR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { failure, SIGNED_OUT, type ActionResult } from "./result";

const schema = z
  .array(z.object({ from: z.guid(), to: z.guid(), account: z.string().min(1).max(100), amount: z.number().int().positive().max(MAX_MINOR) }))
  .min(1)
  .max(60);

export type SortMoneyLine = z.input<typeof schema>[number];

/** The SQL refusals name centavos; say what happened instead. */
function refusal(error: { code?: string; message: string }): { ok: false; error: string } {
  const msg = error.message ?? "";
  if (error.code === "P0001" && /still unsorted/.test(msg)) return { ok: false, error: "Some of this money was already sorted. Reload the page to see what's left." };
  if (error.code === "P0001" && /left in that bucket/.test(msg)) return { ok: false, error: "That's more than is left now, because some was spent. Lower the amounts and try again." };
  if (error.code === "P0001" && /not kept in that account/.test(msg)) return { ok: false, error: "A bucket moved to another account. Reload the page and try again." };
  if (error.code === "P0002") return { ok: false, error: "A bucket isn't there any more. Reload the page and try again." };
  return failure(error);
}

/**
 * "Sort the money you already have" (ticket 34): re-labels money from before the plan into the buckets kept in the
 * account it already sits in. One transaction (`sort_money`); nothing moves between accounts.
 */
export async function sortMoneyAction(lines: SortMoneyLine[]): Promise<ActionResult<{ count: number }>> {
  const parsed = schema.safeParse(lines);
  if (!parsed.success) return { ok: false, error: "Check the amounts and try again." };
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  if (!client) return { ok: false, error: SIGNED_OUT };
  const { data, error } = await client.rpc("sort_money", { p_lines: parsed.data as unknown as Json });
  if (error) return refusal(error);
  revalidatePath("/today");
  revalidatePath("/plans/accounts");
  revalidatePath("/review");
  return { ok: true, count: data ?? 0 };
}
