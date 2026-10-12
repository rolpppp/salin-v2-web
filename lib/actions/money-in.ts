"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { snapshotGoalsSafe, trackMilestonesAfter } from "@/lib/data/goal-milestones";
import { getProfile } from "@/lib/data/today";
import {
  SAVE_FAILED,
  confirmErrorText,
  hoursSince,
  isoDateIn,
  occurredAtFor,
  validateAddIncome,
  type AddIncomeErrors,
  type SourceKind,
} from "@/lib/data/money-in-model";
import type { Json } from "@/lib/database.types";
import { CategoryType } from "@/lib/domain/enums";
import { newCategoryRow, newIncomeEntryRow } from "@/lib/domain/mobile";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

export type AddIncomeResult = { ok: true; entryId: string } | { ok: false; error?: string; errors?: AddIncomeErrors };
export type ConfirmResult = { ok: true; count: number; names: string[] } | { ok: false; error: string };

const NOT_SIGNED_IN = "Your session ended. Sign in again, then try again.";

const addIncomeSchema = z.object({
  sourceId: z.string().min(1).max(100),
  amount: z.string().max(40),
  date: z.string().max(10),
  landedIn: z.string().min(1).max(100),
  aud: z.string().max(40),
});

async function userZone(): Promise<string> {
  const raw = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  return validTimeZone(raw ? decodeURIComponent(raw) : null);
}

/**
 * Add income (SPEC §2.2): an inflow `ledger_entries` row (origin manual, the source's income category) built with
 * the mobile builders, plus its `income_meta` row so it shows in the queue. Soft-deletes the entry if the
 * meta row can't be written, so a half-added income never lingers.
 */
export async function addIncomeAction(input: unknown): Promise<AddIncomeResult> {
  const parsed = addIncomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form and try again." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!supabase || !user) return { ok: false, error: NOT_SIGNED_IN };

  try {
    const now = nowMs();
    const tz = await userZone();
    const todayIso = isoDateIn(now, tz);
    const profile = await getProfile(supabase, user.id);

    const { data: source, error: srcErr } = await supabase
      .from("income_sources")
      .select("id, name, kind, categoryId, isArchived")
      .eq("id", parsed.data.sourceId)
      .is("deletedAt", null)
      .maybeSingle();
    if (srcErr) throw new Error(srcErr.message);
    if (!source || source.isArchived) return { ok: false, errors: { source: "That source isn't available. Pick another one." } };

    const v = validateAddIncome(parsed.data, { todayIso, showAud: source.kind === "salary" });
    if (!v.ok) return { ok: false, errors: v.errors };

    const { data: account, error: accErr } = await supabase
      .from("accounts")
      .select("id, currency, isArchived")
      .eq("id", v.value.landedIn)
      .is("deletedAt", null)
      .maybeSingle();
    if (accErr) throw new Error(accErr.message);
    if (!account || account.isArchived || account.currency !== (profile?.homeCurrency ?? "PHP")) {
      return { ok: false, errors: { landedIn: "Pick one of your peso accounts." } };
    }

    // The entry's category is the source's income category. A source with none gets one now (named after it), so mobile and web agree.
    let categoryId = source.categoryId;
    if (!categoryId) {
      const { data: existing, error: catErr } = await supabase
        .from("categories")
        .select("id")
        .eq("categoryType", CategoryType.income)
        .eq("name", source.name)
        .is("deletedAt", null)
        .limit(1)
        .maybeSingle();
      if (catErr) throw new Error(catErr.message);
      categoryId = existing?.id ?? null;
      if (!categoryId) {
        const cat = newCategoryRow({ userId: user.id, nowMs: now, name: source.name, type: "income" });
        const { error } = await supabase.from("categories").insert(cat);
        if (error) throw new Error(error.message);
        categoryId = cat.id;
      }
      const { error } = await supabase.from("income_sources").update({ categoryId, updatedAt: now }).eq("id", source.id);
      if (error) throw new Error(error.message);
    }

    const row = newIncomeEntryRow({
      userId: user.id,
      nowMs: now,
      accountId: account.id,
      amountMinor: v.value.amountMinor,
      occurredAt: occurredAtFor(v.value.date, todayIso, now),
      categoryId,
    });
    const ins = await supabase.from("ledger_entries").insert(row);
    if (ins.error) throw new Error(ins.error.message);

    const meta = await supabase.from("income_meta").upsert(
      {
        user_id: user.id,
        ledgerEntryId: row.id,
        sourceId: source.id,
        job: null,
        oneBucketId: null,
        sentMinor: v.value.audMinor,
        sentCurrency: v.value.audMinor === null ? null : "AUD",
        updatedAt: now,
      },
      { onConflict: "user_id,ledgerEntryId" },
    );
    if (meta.error) {
      await supabase.from("ledger_entries").update({ deletedAt: now, updatedAt: now }).eq("id", row.id);
      throw new Error(meta.error.message);
    }

    await track("income_added", { source_kind: source.kind, via: "web" });
    revalidatePath("/money-in");
    revalidatePath("/today");
    return { ok: true, entryId: row.id };
  } catch (err) {
    console.error("[money-in] add income failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

const confirmSchema = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(200),
  jobs: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        job: z.enum(["plan", "own", "whole", "one"]).nullable(),
        oneBucketId: z.uuid().nullable(),
      }),
    )
    .max(200),
});

/**
 * Saves the picked jobs and confirms the incomes in ONE transaction (`confirm_incomes_with_jobs`), in date order.
 * The split is computed by SQL; the screen's preview is only a preview.
 */
export async function confirmIncomesAction(input: unknown): Promise<ConfirmResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nothing to confirm. Reload the page and try again." };
  const supabase = await createClient();
  if (!supabase || !(await getCurrentUser())) return { ok: false, error: NOT_SIGNED_IN };

  // Goal progress before the confirm, so `goal_milestone_passed` fires only for milestones this action crossed.
  const goalsBefore = await snapshotGoalsSafe(supabase);
  const { data, error } = await supabase.rpc("confirm_incomes_with_jobs", { entry_ids: parsed.data.ids, p_jobs: parsed.data.jobs as unknown as Json });
  if (error) {
    console.error("[money-in] confirm failed", error.message);
    return { ok: false, error: confirmErrorText(error.message) };
  }

  const rows = data ?? [];
  const byEntry = new Map<string, { job: string; sourceId: string | null; name: string }>();
  for (const r of rows) {
    if (!r.ledgerEntryId || byEntry.has(r.ledgerEntryId)) continue;
    const t = (r.ruleTrace && typeof r.ruleTrace === "object" && !Array.isArray(r.ruleTrace) ? r.ruleTrace : {}) as Record<string, Json | undefined>;
    byEntry.set(r.ledgerEntryId, {
      job: typeof t.job === "string" ? t.job : "unknown",
      sourceId: typeof t.sourceId === "string" ? t.sourceId : null,
      name: typeof t.sourceName === "string" ? t.sourceName : "Income",
    });
  }

  // Analytics: one `income_confirmed` per income (no names or amounts).
  const ids = [...byEntry.keys()];
  if (ids.length > 0) {
    const now = nowMs();
    const [{ data: entries }, { data: sources }] = await Promise.all([
      supabase.from("ledger_entries").select("id, occurredAt").in("id", ids),
      supabase.from("income_sources").select("id, kind").in("id", [...new Set([...byEntry.values()].map((v) => v.sourceId).filter((x): x is string => x !== null))]),
    ]);
    for (const [id, info] of byEntry) {
      const landed = entries?.find((e) => e.id === id)?.occurredAt ?? now;
      const kind = (sources?.find((s) => s.id === info.sourceId)?.kind ?? "other") as SourceKind;
      await track("income_confirmed", { source_kind: kind, job: info.job, count: ids.length, hours_since_landed: hoursSince(landed, now) });
    }
  }

  await trackMilestonesAfter(supabase, goalsBefore);

  revalidatePath("/money-in");
  revalidatePath("/today");
  return { ok: true, count: byEntry.size, names: [...byEntry.values()].map((v) => v.name) };
}
