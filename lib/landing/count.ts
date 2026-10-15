import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** People already on Salin who haven't synced online yet (phone-only). The landing page adds new sign-ups to this. */
export const LANDING_BASELINE = 53;
/** New sign-ups are counted from this moment (the day the count started). */
export const LANDING_SINCE = "2026-10-15T00:00:00+08:00";

const TTL_MS = 5 * 60_000;
let memo: { at: number; value: number } | null = null;

/** Baseline + sign-ups since LANDING_SINCE. Cached for five minutes per server; any failure shows the baseline. */
export async function landingPeopleCount(now = Date.now()): Promise<number> {
  if (memo && now - memo.at < TTL_MS) return memo.value;
  let value = LANDING_BASELINE;
  try {
    const client = await createClient();
    if (client) {
      // Not in the generated types yet (migration 20261015000300).
      const { data, error } = await (client.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)("landing_signup_count", {
        p_since: LANDING_SINCE,
      });
      if (!error && typeof data === "number" && Number.isSafeInteger(data) && data >= 0) value = LANDING_BASELINE + data;
    }
  } catch (err) {
    unstable_rethrow(err);
    console.error("[landing] count failed", err);
  }
  memo = { at: now, value };
  return value;
}
