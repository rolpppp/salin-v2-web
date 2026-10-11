"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { NOT_SIGNED_IN, TRANSFER_GONE, TRANSFER_STALE, TICK_FAILED, tickOutcome, untickOutcome } from "@/lib/data/transfers-model";
import { createClient } from "@/lib/supabase/server";

/** `already` is true when the transfer was already in that state (double click, retry): the screen treats it as done. */
export type TransferResult = { ok: true; already: boolean } | { ok: false; error: string };

const id = z.string().min(1).max(100);
const tickSchema = z.object({ from: id, to: id, amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
const untickSchema = z.object({ from: id, to: id });

function refresh() {
  revalidatePath("/money-in");
  revalidatePath("/today");
}

/**
 * Ticks one transfer as sent (SPEC §2.4, BR §3.6) through `tick_transfer`, which writes the mobile-style
 * `transfers` row and its `_out` / `_in` ledger legs. `amount` is the running total for the pair in the cycle;
 * SQL moves only the difference. The amount must match the current checklist, so a stale screen can't send
 * the wrong figure.
 */
export async function tickTransferAction(input: unknown): Promise<TransferResult> {
  const parsed = tickSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: TRANSFER_STALE };
  const { from, to, amount } = parsed.data;
  const supabase = await createClient();
  if (!supabase || !(await getCurrentUser())) return { ok: false, error: NOT_SIGNED_IN };

  const plan = await supabase.rpc("transfer_plan");
  if (plan.error) {
    console.error("[transfers] plan failed", plan.error.message);
    return { ok: false, error: TICK_FAILED };
  }
  const row = (plan.data ?? []).find((r) => r.kind === "transfer" && r.from_account_id === from && r.to_account_id === to);
  if (!row) return { ok: false, error: TRANSFER_STALE };
  if (row.amount !== amount) return { ok: false, error: TRANSFER_STALE };
  if (row.done) return { ok: true, already: true };

  const { error } = await supabase.rpc("tick_transfer", { p_from: from, p_to: to, p_amount: amount });
  if (error) {
    const o = tickOutcome(error);
    if (o.kind === "already") {
      refresh();
      return { ok: true, already: true };
    }
    console.error("[transfers] tick failed", error.code, error.message);
    return { ok: false, error: o.error };
  }

  await track("transfer_ticked", { is_partial: row.sent > 0 });
  await trackCompletion(supabase);
  refresh();
  return { ok: true, already: false };
}

/** The tick that sends the last transfer closes the cycle (SQL): that is `money_in_completed`, once. */
async function trackCompletion(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>): Promise<void> {
  try {
    const { data: cycle } = await supabase.from("transfer_cycles").select("id, closedAt").is("deletedAt", null).order("seq", { ascending: false }).limit(1).maybeSingle();
    if (!cycle || cycle.closedAt === null) return;
    const { data: rows } = await supabase.from("allocations").select("ledgerEntryId").eq("transferCycleId", cycle.id).is("deletedAt", null);
    const incomes = new Set((rows ?? []).map((r) => r.ledgerEntryId).filter((x): x is string => x !== null));
    await track("money_in_completed", { incomes_count: incomes.size });
  } catch (err) {
    console.error("[transfers] completion analytics failed", err);
  }
}

/** Unticks a transfer: SQL soft-deletes every transfer for the pair in the latest cycle and reopens the cycle. */
export async function untickTransferAction(input: unknown): Promise<TransferResult> {
  const parsed = untickSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: TRANSFER_GONE };
  const supabase = await createClient();
  if (!supabase || !(await getCurrentUser())) return { ok: false, error: NOT_SIGNED_IN };

  const { error } = await supabase.rpc("untick_transfer", { p_from: parsed.data.from, p_to: parsed.data.to });
  if (error) {
    const o = untickOutcome(error);
    if (o.kind === "already") {
      refresh();
      return { ok: true, already: true };
    }
    console.error("[transfers] untick failed", error.code, error.message);
    return { ok: false, error: o.error };
  }
  refresh();
  return { ok: true, already: false };
}
