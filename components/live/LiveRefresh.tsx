"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { createRefreshScheduler, LIVE_TABLES, realtimeEnabled } from "@/lib/live/refresh-scheduler";
import { createClient } from "@/lib/supabase/browser";

/** Events within this long of the user's own click or keypress are their own writes: refresh, but don't announce. */
const OWN_ACTION_MS = 4_000;

/**
 * Keeps the open page current: when the phone syncs (or another tab writes), re-render the server components.
 * One channel per signed-in session; RLS limits events to the user's own rows. Renders nothing. If the socket can't
 * connect (no realtime server, offline) it stays silent and the page just doesn't live-update.
 */
export function LiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  const announce = useAnnounce();
  const routerRef = useRef(router);
  const announceRef = useRef(announce);
  useEffect(() => {
    routerRef.current = router;
    announceRef.current = announce;
  });

  useEffect(() => {
    if (!realtimeEnabled()) return;
    const client = createClient();
    if (!client) return;

    let lastOwnAction = 0;
    const markOwn = () => {
      lastOwnAction = Date.now();
    };
    const scheduler = createRefreshScheduler({
      isHidden: () => document.visibilityState === "hidden",
      refresh: (sources) => {
        const own = Date.now() - lastOwnAction < OWN_ACTION_MS;
        routerRef.current.refresh();
        if (!own && sources.has("ledger_entries")) announceRef.current("Updated from your phone.");
      },
    });
    const onVisibility = () => scheduler.visibilityChanged();
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", markOwn, true);
    document.addEventListener("keydown", markOwn, true);

    let cancelled = false;
    let channel: ReturnType<typeof client.channel> | null = null;
    let subscribedBefore = false;
    let dropped = false;

    void (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (cancelled || !data.session) return;
        await client.realtime.setAuth(data.session.access_token);
        if (cancelled) return;
        let ch = client.channel(`live-refresh-${userId}`);
        for (const table of LIVE_TABLES) {
          ch = ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` }, () => scheduler.notify(table));
        }
        channel = ch.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (subscribedBefore && dropped) scheduler.reconnected();
            subscribedBefore = true;
            dropped = false;
          } else if (subscribedBefore) {
            dropped = true; // CHANNEL_ERROR, TIMED_OUT or CLOSED after a good connection; supabase-js rejoins by itself
          }
        });
      } catch {
        // No realtime: degrade silently.
      }
    })();

    const { data: sub } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && channel) {
        void client.removeChannel(channel);
        channel = null;
      }
    });

    return () => {
      cancelled = true;
      scheduler.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", markOwn, true);
      document.removeEventListener("keydown", markOwn, true);
      sub.subscription.unsubscribe();
      if (channel) void client.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
