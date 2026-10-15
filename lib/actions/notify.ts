"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { getNotifications } from "@/lib/data/notify";
import type { Notice, NotifyPrefs } from "@/lib/notify/rules";
import { createClient } from "@/lib/supabase/server";
import { SAVE_FAILED, SIGNED_OUT, type ActionResult } from "./result";

type Loose = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const prefsPatch = z
  .object({
    dailyLog: z.boolean(),
    dailyLogAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    streakRisk: z.boolean(),
    moneyDay: z.boolean(),
    weeklyReview: z.boolean(),
    browser: z.boolean(),
  })
  .partial()
  .strict();

async function session() {
  const user = await getCurrentUser();
  const client = user ? await createClient() : null;
  return client && user ? { client: client as unknown as Loose, user } : null;
}

/** Turn reminders on or off, or move the daily nudge. Saves on change. */
export async function setNotifyPrefs(input: Partial<NotifyPrefs>): Promise<ActionResult> {
  const parsed = prefsPatch.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That setting isn't valid." };
  const s = await session();
  if (!s) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await s.client.from("notification_prefs").upsert({ user_id: s.user.id, ...parsed.data }, { onConflict: "user_id" });
    if (error) {
      console.error("[notify] save prefs failed", error.message);
      return { ok: false, error: SAVE_FAILED };
    }
    await track("notify_prefs_changed", { keys: Object.keys(parsed.data).join(",") });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Mark notices as read (opening the bell, or tapping one). Idempotent. */
export async function markNoticesRead(keys: string[]): Promise<ActionResult> {
  const parsed = z.array(z.string().min(3).max(80)).max(20).safeParse(keys);
  if (!parsed.success) return { ok: false, error: "Couldn't mark those." };
  if (parsed.data.length === 0) return { ok: true };
  const s = await session();
  if (!s) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await s.client
      .from("notification_reads")
      .upsert(parsed.data.map((key) => ({ user_id: s.user.id, key })), { onConflict: "user_id,key", ignoreDuplicates: true });
    if (error) return { ok: false, error: SAVE_FAILED };
    return { ok: true };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Right before a device shows a reminder: is it still worth showing? (Not read, and today still isn't counted, etc.) */
export async function checkNotice(key: string): Promise<{ show: Notice | null }> {
  const bundle = await getNotifications();
  const n = bundle?.notices.find((x) => x.key === key) ?? null;
  return { show: n && !n.read ? n : null };
}
