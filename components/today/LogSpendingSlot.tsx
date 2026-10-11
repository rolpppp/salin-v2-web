import { cookies } from "next/headers";
import { LogSpendingLauncher } from "@/components/log-spending/LogSpendingLauncher";
import styles from "@/components/log-spending/log-spending.module.css";
import { getLogSpendingData } from "@/lib/data/log-spending";
import type { LogSpendingData } from "@/lib/data/log-spending-model";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

/**
 * Server component for the greeting area: loads what the Log spending sheet needs and renders
 * "+ Log spending", the sheet and the Logged flag. Renders nothing when the numbers can't be loaded
 * (Today then shows its own "Couldn't load" state), so a button never opens a sheet with made-up numbers.
 */
export async function LogSpendingSlot() {
  const supabase = await createClient();
  if (!supabase) return null;
  const raw = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  const timeZone = validTimeZone(raw ? decodeURIComponent(raw) : null);
  let data: LogSpendingData;
  try {
    data = await getLogSpendingData(supabase, { nowMs: nowMs(), timeZone });
  } catch (err) {
    console.error("[today] log spending could not load", err);
    return null;
  }
  return (
    <div className={styles.slot}>
      <LogSpendingLauncher data={data} />
    </div>
  );
}
