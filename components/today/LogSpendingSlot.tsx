import { cache } from "react";
import { cookies } from "next/headers";
import { LogSpendingLauncher } from "@/components/log-spending/LogSpendingLauncher";
import { getLogSpendingData } from "@/lib/data/log-spending";
import type { LogSpendingData } from "@/lib/data/log-spending-model";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

/** One load per request: Today renders the slot in the greeting and, in the first week, in the next-step card. */
const loadLogSpending = cache(async (): Promise<LogSpendingData | null> => {
  const supabase = await createClient();
  if (!supabase) return null;
  const raw = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  const timeZone = validTimeZone(raw ? decodeURIComponent(raw) : null);
  try {
    return await getLogSpendingData(supabase, { nowMs: nowMs(), timeZone });
  } catch (err) {
    console.error("[today] log spending could not load", err);
    return null;
  }
});

/** Starts the load without waiting for it; the slot (and anything else) then shares the same promise. */
export function startLogSpendingLoad(): void {
  void loadLogSpending();
}

/**
 * "+ Log spending" for Today: a soft button in the greeting row, a primary one in the "Log your first
 * spending" next-step card. Loads what the sheet needs and renders the launcher (button, sheet, Logged flag).
 * Renders nothing when the numbers can't be loaded, so a button never opens a sheet with made-up numbers.
 */
export async function LogSpendingSlot({ variant = "soft" }: { variant?: "soft" | "primary" }) {
  const data = await loadLogSpending();
  if (!data) return null;
  return <LogSpendingLauncher data={data} variant={variant} />;
}
