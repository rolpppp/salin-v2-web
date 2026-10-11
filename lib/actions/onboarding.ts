"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { track } from "@/lib/analytics";
import type { EventMap } from "@/lib/analytics";
import { requireUser } from "@/lib/auth/session";
import { loadPhone, type PhoneLoad } from "@/lib/data/onboarding";
import type { Json } from "@/lib/database.types";
import { draftSchema } from "@/lib/onboarding/draft";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";
import { dbFailure, SAVE_FAILED, type ActionResult } from "./planResult";

const PATH = "/welcome";

/** The SQL functions explain bad input in plain words (22023 invalid input, 55000 wrong state, P0001); anything else is "couldn't save". */
const sqlFailure = (e: { code?: string | null; message?: string | null }): string => dbFailure(e.code === "22023" || e.code === "55000" ? { ...e, code: "P0001" } : e);

/**
 * Autosave (SPEC §7.2): validates the draft with the shared schema and upserts `user_profiles.onboardingDraft`
 * under RLS. Writes nothing else; plan tables are untouched until Finish. Last write wins (the client sends them in order).
 */
export async function saveDraft(input: unknown): Promise<ActionResult> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: SAVE_FAILED };
  const user = await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { error } = await client.from("user_profiles").upsert({ user_id: user.id, onboardingDraft: parsed.data as unknown as Json }, { onConflict: "user_id" });
    if (error) return { ok: false, error: dbFailure(error) };
    return { ok: true };
  } catch (err) {
    console.error("[onboarding] save draft failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/**
 * Finish (SPEC §7.5 step 5): reads the draft that's stored (so another device's edits count and the client can't send
 * something else), validates it, and hands it to the one SQL transaction. "Make a plan" re-entry (`planOnly`) calls
 * `apply_plan_only` instead. Returns the summary jsonb from `finish_onboarding` (null for plan-only).
 */
export async function finishOnboarding(): Promise<ActionResult<{ summary: Json | null }>> {
  const user = await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { data, error } = await client.from("user_profiles").select("onboardingDraft").eq("user_id", user.id).maybeSingle();
    if (error) return { ok: false, error: dbFailure(error) };
    const parsed = draftSchema.safeParse(data?.onboardingDraft);
    if (!parsed.success) return { ok: false, error: "We couldn't read your saved answers. Go back a step and continue again." };
    const draft = parsed.data as unknown as Json;

    if (parsed.data.planOnly) {
      const r = await client.rpc("apply_plan_only", { p_draft: draft });
      if (r.error) return { ok: false, error: sqlFailure(r.error) };
      revalidatePath("/today");
      return { ok: true, value: { summary: null } };
    }
    const r = await client.rpc("finish_onboarding", { p_draft: draft });
    if (r.error) return { ok: false, error: sqlFailure(r.error) };
    revalidatePath("/today");
    revalidatePath("/money-in");
    return { ok: true, value: { summary: r.data ?? null } };
  } catch (err) {
    console.error("[onboarding] finish failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Re-reads what the phone synced: the "Waiting for your phone" poll, and the Realtime nudge. Read-only. */
export async function loadPhoneData(): Promise<ActionResult<PhoneLoad>> {
  await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const raw = (await cookies()).get(TZ_COOKIE)?.value ?? null;
    const timeZone = validTimeZone(raw ? decodeURIComponent(raw) : null);
    return { ok: true, value: await loadPhone(client, { nowMs: nowMs(), timeZone }) };
  } catch (err) {
    console.error("[onboarding] phone read failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

const eventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("onboarding_started"), props: z.object({ path: z.enum(["web", "app"]), auto_detected: z.boolean() }) }),
  z.object({ event: z.literal("onboarding_step_completed"), props: z.object({ path: z.enum(["web", "app"]), step: z.string().max(20), seconds_on_step: z.number().int().min(0).max(86_400) }) }),
  z.object({ event: z.literal("sync_prompt_shown"), props: z.object({ seconds_waited: z.number().int().min(0).max(86_400) }) }),
  z.object({ event: z.literal("sync_connected"), props: z.object({ seconds_waited: z.number().int().min(0).max(86_400) }) }),
]);

export type OnboardingEvent = z.infer<typeof eventSchema>;

/** Records one of the onboarding events (ROADMAP §4 properties only). Never throws; analytics must not block the flow. */
export async function trackOnboarding(input: unknown): Promise<void> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return;
  const { event, props } = parsed.data;
  await track(event, props as EventMap[typeof event]);
}
