"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TZ_COOKIE } from "@/lib/time";

/**
 * Tells the server the visitor's time zone (cookie) so "this week" matches their local Monday.
 * Refreshes once when the zone first becomes known or changes.
 */
export function TimezoneSync({ serverZone }: { serverZone: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let zone: string;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone || zone === serverZone) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [serverZone, router]);
  return null;
}
