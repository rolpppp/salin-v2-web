"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { track } from "@/lib/analytics";
import type { EventMap } from "@/lib/analytics";
import { requireUser } from "@/lib/auth/session";
import { loadPhone, type PhoneLoad } from "@/lib/data/onboarding";
import type { Json } from "@/lib/database.types";
import { LedgerOrigin, MoneyDirection } from "@/lib/domain/enums";
import { draftSchema, readDraft } from "@/lib/onboarding/draft";
import { makePlanDraft, mainSourceOf } from "@/lib/onboarding/web-path";
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
// No revalidatePath for a first finish on purpose: an action that revalidates also refreshes the page it was called
// from, the welcome layout then sees `onboardedAt` and redirects to Today, and the Done card vanishes. A first-time
// user has never rendered Today, so the client router cache holds nothing stale. Make a plan (planOnly) does revalidate.
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
      // Make a plan started from Today, and the client router cache (staleTimes) may still hold that render: drop it,
      // or Today keeps offering "Make a plan" for up to a minute. This flow leaves for Today anyway, so refreshing
      // the welcome page here costs nothing.
      revalidatePath("/today");
      return { ok: true, value: { summary: null } };
    }
    const r = await client.rpc("finish_onboarding", { p_draft: draft });
    if (r.error) return { ok: false, error: sqlFailure(r.error) };
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
  z.object({
    event: z.literal("onboarding_completed"),
    props: z.object({
      path: z.enum(["web", "app"]),
      plan_mode: z.string().max(20),
      first_pay: z.enum(["confirmed", "later"]),
      transfers_ticked: z.number().int().min(0).max(20),
      minutes: z.number().int().min(0).max(100_000),
    }),
  }),
]);

export type OnboardingEvent = z.infer<typeof eventSchema>;

/** Records one of the onboarding events (ROADMAP §4 properties only). Never throws; analytics must not block the flow. */
export async function trackOnboarding(input: unknown): Promise<void> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return;
  const { event, props } = parsed.data;
  await track(event, props as EventMap[typeof event]);
}

export type MakePlanState = { error: string } | null;

/**
 * Today's "Make a plan" (SPEC §7.6): stores a `planOnly` draft at Priorities, seeded from the user's own accounts, income
 * source and pay, then opens `/welcome/prio`. Nothing but the draft is written; the plan itself lands at "Save my plan"
 * (`finishOnboarding` -> `apply_plan_only`). Resumes an unfinished Make-a-plan draft as it is. Shaped for `useActionState`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the signature `useActionState` calls
export async function startMakeAPlan(_previous: MakePlanState, _form?: FormData): Promise<MakePlanState> {
  const user = await requireUser("/today");
  const client = await createClient();
  if (!client) return { error: SAVE_FAILED };
  let notOnboarded = false;
  try {
    const profile = await client
      .from("user_profiles")
      .select("firstName, onboardingPath, payFrequency, nextPaydayDate, onboardedAt, onboardingDraft, deletedAt")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile.error) return { error: dbFailure(profile.error) };
    const row = profile.data;
    if (!row || row.deletedAt !== null || row.onboardedAt === null) {
      notOnboarded = true;
    } else {
      const [accounts, sources] = await Promise.all([
        client.from("accounts").select("id, name, accountType, currency, isArchived").is("deletedAt", null).order("displayOrder").order("id"),
        client.from("income_sources").select("kind, landsInAccountId, categoryId").is("deletedAt", null).eq("isArchived", false).order("createdAt").order("id"),
      ]);
      if (accounts.error) return { error: dbFailure(accounts.error) };
      if (sources.error) return { error: dbFailure(sources.error) };

      const main = mainSourceOf(sources.data ?? []);
      let latestPayMinor: number | null = null;
      if (main?.categoryId) {
        const pay = await client
          .from("ledger_entries")
          .select("amountMinor")
          .eq("categoryId", main.categoryId)
          .eq("direction", MoneyDirection.inflow)
          .neq("origin", LedgerOrigin.transfer)
          .neq("origin", LedgerOrigin.adjustment)
          .is("deletedAt", null)
          .order("occurredAt", { ascending: false })
          .limit(1);
        if (pay.error) return { error: dbFailure(pay.error) };
        latestPayMinor = pay.data?.[0]?.amountMinor ?? null;
      }

      const draft = makePlanDraft({ profile: row, accounts: accounts.data ?? [], sources: sources.data ?? [], latestPayMinor, stored: readDraft(row.onboardingDraft) });
      const parsed = draftSchema.safeParse(draft);
      if (!parsed.success) return { error: SAVE_FAILED };
      const saved = await client.from("user_profiles").update({ onboardingDraft: parsed.data as unknown as Json }).eq("user_id", user.id);
      if (saved.error) return { error: dbFailure(saved.error) };
    }
  } catch (err) {
    console.error("[onboarding] make a plan failed", err);
    return { error: SAVE_FAILED };
  }
  // redirect() throws, so it stays outside the try. Someone who hasn't finished setup goes to the first-run flow instead.
  redirect(notOnboarded ? "/welcome" : "/welcome/prio");
}
