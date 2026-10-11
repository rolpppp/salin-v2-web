import { cache } from "react";
import { cookies } from "next/headers";
import type { TabBadge } from "@/components/app-shell/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone, zonedParts } from "@/lib/time";

/**
 * The two header badges (SPEC §0): Money in (coral dot + count while income waits) and Review (a dot on the
 * review day while the week is open). One cheap RPC (`tab_badges`), cached per request with React `cache`,
 * so the layout and anything else asking in the same render share one round trip. Any failure means no
 * badges: a missing dot must never break a page.
 */
export const getTabBadges = cache(async (): Promise<Partial<Record<string, TabBadge>>> => {
  try {
    const supabase = await createClient();
    if (!supabase) return {};
    const raw = (await cookies()).get(TZ_COOKIE)?.value ?? null;
    const p = zonedParts(nowMs(), validTimeZone(raw ? decodeURIComponent(raw) : null));
    const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    const { data, error } = await supabase.rpc("tab_badges", { p_today: today });
    const row = data?.[0];
    if (error || !row) return {};
    const out: Partial<Record<string, TabBadge>> = {};
    if (row.waiting_count > 0) {
      out["/money-in"] = { tone: "needs", count: row.waiting_count, label: row.waiting_count === 1 ? "1 income waiting for a job" : `${row.waiting_count} incomes waiting for a job` };
    }
    if (row.review_due) out["/review"] = { tone: "due", label: "Review due" };
    return out;
  } catch {
    return {};
  }
});
