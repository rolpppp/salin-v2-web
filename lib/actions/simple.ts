"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import type { Json } from "@/lib/database.types";
import { getStreak } from "@/lib/data/simple-today";
import { amountBand } from "@/lib/data/simple-today-model";
import { isoDateIn } from "@/lib/data/money-in-model";
import { MAX_MINOR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";
import { failure, SAVE_FAILED, SIGNED_OUT, type ActionResult } from "./result";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idText = z.string().min(1).max(100);

const receiveSchema = z.object({
  amountMinor: z.number().int().positive().max(MAX_MINOR),
  receivedInId: idText,
  sourceId: z.guid().nullable(),
  name: z.string().max(120).nullable(),
  on: isoDay,
  lines: z
    .array(z.object({ bucketId: z.guid(), destAccountId: idText, amountMinor: z.number().int().positive().max(MAX_MINOR) }))
    .min(1)
    .max(50),
});

export type ReceiveMoneyInput = z.input<typeof receiveSchema>;

async function session() {
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  return client ? { client, user: user! } : null;
}

async function userZone(): Promise<string> {
  const raw = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  return validTimeZone(raw ? decodeURIComponent(raw) : null);
}

/** Every Simple Money write shows up on Today and Money in (the move rows, the hero number). */
function refresh() {
  revalidatePath("/today");
  revalidatePath("/money-in");
}

/** Errors the SQL functions word for people (22023, P0001) come through; anything else is a generic failure. */
function refusal(error: { code?: string; message: string }): { ok: false; error: string } {
  if (error.code === "P0001" && error.message.trim()) return { ok: false, error: error.message.trim() };
  return failure(error);
}

/**
 * "I got money": one inflow plus its allocation lines in one transaction (`receive_money`). The lines must add
 * up to the amount exactly; the SQL function re-checks everything (ownership, peso accounts, live buckets, date).
 * Lines whose account is not the one the money landed in become "Move X from A to B" rows in the transfer checklist.
 */
export async function receiveMoney(input: {
  amountMinor: number;
  receivedInId: string;
  sourceId: string | null;
  name: string | null;
  on: string;
  lines: { bucketId: string; destAccountId: string; amountMinor: number }[];
}): Promise<ActionResult<{ entryId: string }>> {
  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the amounts and try again." };
  const v = parsed.data;
  const total = v.lines.reduce((t, l) => t + l.amountMinor, 0);
  if (!Number.isSafeInteger(total) || total !== v.amountMinor) return { ok: false, error: "The amounts don't add up to what you received." };
  const s = await session();
  if (!s) return { ok: false, error: SIGNED_OUT };
  try {
    if (v.on > isoDateIn(nowMs(), await userZone())) return { ok: false, error: "That date hasn't happened yet." };
    const { data, error } = await s.client.rpc("receive_money", {
      p_amount: v.amountMinor,
      p_received_in: v.receivedInId,
      p_source_id: v.sourceId,
      p_name: v.name,
      p_on: v.on,
      p_lines: v.lines as unknown as Json,
    });
    if (error) {
      console.error("[simple] receive_money failed", error.message);
      return refusal(error);
    }
    await track("money_received", {
      amount_band: amountBand(v.amountMinor),
      accounts_count: new Set([v.receivedInId, ...v.lines.map((l) => l.destAccountId)]).size,
    });
    refresh();
    return { ok: true, entryId: String(data) };
  } catch (err) {
    console.error("[simple] receive failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Marks (or unmarks) a day as "no spend". Today or up to 14 days back. A streak milestone is recorded once, on the day it is reached. */
export async function setNoSpend(day: string, on: boolean): Promise<ActionResult> {
  const parsed = z.object({ day: isoDay, on: z.boolean() }).safeParse({ day, on });
  if (!parsed.success) return { ok: false, error: "Pick a day and try again." };
  const s = await session();
  if (!s) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await s.client.rpc("set_no_spend", { p_day: parsed.data.day, p_on: parsed.data.on });
    if (error) {
      console.error("[simple] set_no_spend failed", error.message);
      return refusal(error);
    }
    await track("no_spend_marked", { marked: parsed.data.on });
    if (parsed.data.on) {
      const tz = await userZone();
      const now = nowMs();
      if (parsed.data.day === isoDateIn(now, tz)) {
        const st = await getStreak(s.client, { nowMs: now, timeZone: tz });
        if (st.milestone !== null) await track("streak_milestone", { days: st.milestone });
      }
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("[simple] no-spend failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Simple or full Today. */
export async function setViewMode(mode: "simple" | "full"): Promise<ActionResult> {
  const parsed = z.enum(["simple", "full"]).safeParse(mode);
  if (!parsed.success) return { ok: false, error: "Pick simple or full." };
  const s = await session();
  if (!s) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await s.client.rpc("set_view_mode", { p_mode: parsed.data });
    if (error) {
      console.error("[simple] set_view_mode failed", error.message);
      return refusal(error);
    }
    await track("view_mode_changed", { mode: parsed.data });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[simple] view mode failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** The day the spending money must last until (that day is not counted). Null clears it. */
export async function setSpendUntil(day: string | null): Promise<ActionResult> {
  const parsed = isoDay.nullable().safeParse(day);
  if (!parsed.success) return { ok: false, error: "Pick a date and try again." };
  const s = await session();
  if (!s) return { ok: false, error: SIGNED_OUT };
  try {
    if (parsed.data !== null && parsed.data < isoDateIn(nowMs(), await userZone())) return { ok: false, error: "Pick today or a later day." };
    const { error } = await s.client.rpc("set_spend_until", { p_day: parsed.data });
    if (error) {
      console.error("[simple] set_spend_until failed", error.message);
      return refusal(error);
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("[simple] spend until failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** The bucket that "kept aside" money goes to. */
export async function setKeepBucket(id: string): Promise<ActionResult> {
  const parsed = z.guid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Pick a bucket and try again." };
  const s = await session();
  if (!s) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await s.client.rpc("set_keep_bucket", { p_bucket: parsed.data });
    if (error) {
      console.error("[simple] set_keep_bucket failed", error.message);
      return refusal(error);
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("[simple] keep bucket failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
