"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { getBucketLefts, getLogBuckets } from "@/lib/data/log-spending";
import { daysUntil, spendSafe, validateLogSpending, type LogField, type LogSpendingErrors, type LoggedImpact } from "@/lib/data/log-spending-model";
import { SAVE_FAILED, isoDateIn, occurredAtFor } from "@/lib/data/money-in-model";
import { getProfile } from "@/lib/data/today";
import { CategoryType } from "@/lib/domain/enums";
import { newSpendingEntryRow } from "@/lib/domain/mobile";
import { perDay } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

export type LogSpendingResult =
  | { ok: true; entryId: string; categoryName: string; impact: LoggedImpact }
  | { ok: false; error?: string; errors?: LogSpendingErrors; first?: LogField };

const NOT_SIGNED_IN = "Your session ended. Sign in again, then try again.";

const schema = z.object({
  amount: z.string().max(40),
  categoryId: z.string().max(100),
  note: z.string().max(200),
  accountId: z.string().max(100),
  date: z.string().max(10),
});

/**
 * Log spending (SPEC §8, BR §11): one outflow `ledger_entries` row (origin manual) built with the mobile
 * builders. The `entry_buckets` trigger stores the bucket from `category_buckets` at insert time, so this
 * never writes it. Ids are not FK-guarded across users, so the category and account are re-read through RLS
 * (and `user_id`) before the insert. Returns the numbers for the Logged flag, recomputed from `bucket_left`.
 */
export async function logSpending(input: unknown): Promise<LogSpendingResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form and try again." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!supabase || !user) return { ok: false, error: NOT_SIGNED_IN };

  try {
    const now = nowMs();
    const raw = (await cookies()).get(TZ_COOKIE)?.value ?? null;
    const tz = validTimeZone(raw ? decodeURIComponent(raw) : null);
    const todayIso = isoDateIn(now, tz);

    const v = validateLogSpending(parsed.data, { todayIso });
    if (!v.ok) return { ok: false, errors: v.errors, first: v.first };

    const profile = await getProfile(supabase, user.id);
    const buckets = await getLogBuckets(supabase);
    const [catRes, mapRes, accRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("id", v.value.categoryId)
        .eq("user_id", user.id)
        .eq("categoryType", CategoryType.expense)
        .is("deletedAt", null)
        .maybeSingle(),
      supabase.from("category_buckets").select("bucketId").eq("categoryId", v.value.categoryId).eq("user_id", user.id).is("deletedAt", null).maybeSingle(),
      supabase.from("accounts").select("id, currency").eq("id", v.value.accountId).eq("user_id", user.id).is("deletedAt", null).eq("isArchived", false).maybeSingle(),
    ]);
    for (const r of [catRes, mapRes, accRes]) if (r.error) throw new Error(r.error.message);

    const bucket = buckets.find((b) => b.id === mapRes.data?.bucketId);
    if (!catRes.data || !mapRes.data || !bucket) {
      return { ok: false, errors: { category: "Pick a category, so it comes out of the right bucket." }, first: "category" };
    }
    if (!accRes.data || accRes.data.currency !== (profile?.homeCurrency ?? "PHP")) {
      return { ok: false, errors: { account: "Pick one of your peso accounts." }, first: "account" };
    }

    const row = newSpendingEntryRow({
      userId: user.id,
      nowMs: now,
      accountId: accRes.data.id,
      categoryId: catRes.data.id,
      amountMinor: v.value.amountMinor,
      occurredAt: occurredAtFor(v.value.date, todayIso, now),
      note: v.value.note,
    });
    const ins = await supabase.from("ledger_entries").insert(row);
    if (ins.error) throw new Error(ins.error.message);

    // The numbers for the flag come from the database after the insert, never from what the browser last showed.
    const [lefts, payday] = await Promise.all([getBucketLefts(supabase), supabase.from("user_profiles").select("nextPaydayDate").maybeSingle()]);
    const days = daysUntil(payday.data?.nextPaydayDate ?? null, todayIso);
    const isSpend = bucket.groupKey === "spend";
    const impact: LoggedImpact = {
      bucketName: bucket.name,
      bucketLeftMinor: lefts[bucket.id] ?? 0,
      isSpendBucket: isSpend,
      perDayMinor: isSpend && days !== null ? perDay(spendSafe(buckets, lefts), days) : null,
    };

    await track("spending_logged", { via: "web", bucket_group: bucket.groupKey });
    revalidatePath("/today");
    return { ok: true, entryId: row.id, categoryName: catRes.data.name, impact };
  } catch (err) {
    console.error("[spending] log failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
