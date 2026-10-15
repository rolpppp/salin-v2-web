import { unstable_rethrow } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";
import { getStreak } from "@/lib/data/simple-today";
import { isoDateIn } from "@/lib/data/money-in-model";
import type { StreakResult } from "@/lib/money";
import { DEFAULT_PREFS, noticesFor, type Notice, type NotifyPrefs } from "@/lib/notify/rules";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone, zonedParts } from "@/lib/time";

export interface NotifyBundle {
  notices: Notice[];
  prefs: NotifyPrefs;
  streak: StreakResult;
  todayIso: string;
  /** Minutes since local midnight when this was computed, and the instant, so a device can schedule what's left today. */
  nowMinutes: number;
  nowMs: number;
}

type Row = Record<string, unknown>;
// The two tables are newer than the generated types (migration 20261015000400).
type Loose = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function prefsFromRow(row: Row | null): NotifyPrefs {
  if (!row) return DEFAULT_PREFS;
  const at = typeof row.dailyLogAt === "string" ? row.dailyLogAt.slice(0, 5) : DEFAULT_PREFS.dailyLogAt;
  return {
    dailyLog: row.dailyLog !== false,
    dailyLogAt: at,
    streakRisk: row.streakRisk !== false,
    moneyDay: row.moneyDay !== false,
    weeklyReview: row.weeklyReview !== false,
    browser: row.browser === true,
  };
}

/**
 * Today's notices for the signed-in user (in their zone), their reminder settings and their streak. One per request (cached),
 * shared by the header bell and Today. Null when signed out or on any failure: the bell then simply isn't shown.
 */
export const getNotifications = cache(async (): Promise<NotifyBundle | null> => {
  try {
    const client = await createClient();
    if (!client) return null;
    const raw = (await cookies()).get(TZ_COOKIE)?.value ?? null;
    const timeZone = validTimeZone(raw ? decodeURIComponent(raw) : null);
    const now = nowMs();
    const todayIso = isoDateIn(now, timeZone);
    const p = zonedParts(now, timeZone);
    const loose = client as unknown as Loose;

    const [profileRes, prefsRes, readsRes, streak] = await Promise.all([
      client.from("user_profiles").select("reviewDay, nextPaydayDate, spendUntil, viewMode, deletedAt").maybeSingle(),
      loose.from("notification_prefs").select("*").maybeSingle(),
      loose.from("notification_reads").select("key").like("key", `%:${todayIso}`),
      getStreak(client, { nowMs: now, timeZone }),
    ]);
    if (profileRes.error || !profileRes.data || profileRes.data.deletedAt !== null) return null;
    const profile = profileRes.data;
    const prefs = prefsFromRow(prefsRes.error ? null : (prefsRes.data as Row | null));
    const read = new Set<string>(readsRes.error ? [] : ((readsRes.data ?? []) as Array<{ key: string }>).map((r) => r.key));
    const spendUntil = profile.spendUntil && profile.spendUntil >= todayIso ? profile.spendUntil : null;
    const notices = noticesFor({
      todayIso,
      nowMinutes: p.hour * 60 + p.minute,
      weekday: p.weekday,
      streak,
      moneyDay: spendUntil ?? profile.nextPaydayDate ?? null,
      reviewDay: profile.reviewDay ?? 0,
      viewMode: profile.viewMode === "simple" ? "simple" : "full",
      prefs,
      read,
    });
    return { notices, prefs, streak, todayIso, nowMinutes: p.hour * 60 + p.minute, nowMs: now };
  } catch (err) {
    unstable_rethrow(err);
    console.error("[notify] could not load", err);
    return null;
  }
});
