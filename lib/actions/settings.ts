"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { MAX_MINOR } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { failure, SAVE_FAILED, SIGNED_OUT, type ActionResult } from "./result";
import { setKeepBucket, setViewMode } from "./simple";

/**
 * Settings (ticket 37). Each section saves on its own. The SQL setters re-check everything; Zod keeps junk from reaching
 * them. Changes apply from now on (nothing already received, allocated or closed is recomputed). Analytics gets the
 * section name only, never an amount or a name.
 */

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const incomeSchema = z.object({
  amountMinor: z.number().int().positive().max(MAX_MINOR).nullable(),
  rhythm: z.enum(["weekly", "biweekly", "twice", "monthly", "quarterly", "semester", "varies"]).nullable(),
  next: isoDay.nullable(),
});

const basicsSchema = z.object({
  firstName: z.string().trim().max(60).nullable(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  reviewDay: z.number().int().min(0).max(6),
});

export type SettingsSection = "income" | "week" | "about" | "keep" | "view";

async function session() {
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  return client ? { client, user: user! } : null;
}

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/today");
  revalidatePath("/review");
}

/** Errors the SQL functions word for people (22023, P0001) come through; anything else is a generic failure. */
function refusal(error: { code?: string; message: string }): { ok: false; error: string } {
  if (error.code === "P0001" && error.message.trim()) return { ok: false, error: error.message.trim() };
  return failure(error);
}

/** About how much, how often and when the next money arrives. Any part may be null (= not set). */
export async function saveIncomeRhythm(input: { amountMinor: number | null; rhythm: string | null; next: string | null }): Promise<ActionResult> {
  const parsed = incomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the amount, how often and the date, then try again." };
  const s = await session();
  if (!s) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await s.client.rpc("set_income_rhythm", { p_amount: parsed.data.amountMinor, p_rhythm: parsed.data.rhythm, p_next: parsed.data.next });
    if (error) {
      console.error("[settings] set_income_rhythm failed", error.message);
      return refusal(error);
    }
    await track("settings_changed", { section: "income" });
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("[settings] income failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** First name, which day the week starts on, and the review day. `section` is only the analytics label. */
export async function saveProfileBasics(input: { firstName: string | null; weekStartsOn: number; reviewDay: number; section: "week" | "about" }): Promise<ActionResult> {
  const parsed = basicsSchema.safeParse(input);
  const section = input.section === "about" ? "about" : "week";
  if (!parsed.success) return { ok: false, error: "Keep your name to 60 letters or fewer, and pick a week start and review day." };
  const s = await session();
  if (!s) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await s.client.rpc("set_profile_basics", {
      p_first_name: parsed.data.firstName === "" ? null : parsed.data.firstName,
      p_week_starts_on: parsed.data.weekStartsOn,
      p_review_day: parsed.data.reviewDay,
    });
    if (error) {
      console.error("[settings] set_profile_basics failed", error.message);
      return refusal(error);
    }
    await track("settings_changed", { section });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[settings] basics failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Kept-aside bucket (Simple view's "kept aside"). Reuses `set_keep_bucket`. */
export async function saveKeepBucket(input: { bucketId: string }): Promise<ActionResult> {
  const r = await setKeepBucket(input.bucketId);
  if (r.ok) {
    await track("settings_changed", { section: "keep" });
    revalidatePath("/settings");
  }
  return r;
}

/** Simple or Full. Reuses `set_view_mode`. */
export async function saveViewMode(input: { mode: "simple" | "full" }): Promise<ActionResult> {
  const r = await setViewMode(input.mode);
  if (r.ok) {
    await track("settings_changed", { section: "view" });
    revalidatePath("/settings");
  }
  return r;
}
