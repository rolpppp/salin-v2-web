/**
 * Pure coalescing logic behind LiveRefresh. Realtime events arrive in bursts (a phone sync writes hundreds of rows):
 * collapse them into one refresh after a quiet period, hold it while the tab is hidden, and fire once when it is shown.
 */
export const LIVE_DEBOUNCE_MS = 800;

/** Tables that refresh the page. Mobile-synced tables first, then the web tables another tab can write. */
export const LIVE_TABLES = [
  "ledger_entries",
  "accounts",
  "categories",
  "transfers",
  "allocations",
  "transfer_checks",
  "bucket_covers",
  "income_meta",
  "week_reviews",
  "user_profiles",
  "buckets",
  "allocation_plans",
  "allocation_plan_lines",
  "income_sources",
] as const;

/** user_profiles is keyed by user_id too; every table above has a user_id column. */
export type LiveTable = (typeof LIVE_TABLES)[number];

export type RefreshScheduler = {
  /** A realtime event for `source` (a table name) arrived. */
  notify: (source: string) => void;
  /** The socket re-subscribed after a drop: events may have been missed, so refresh once. */
  reconnected: () => void;
  /** Call on visibilitychange; fires a pending refresh once the tab is visible. */
  visibilityChanged: () => void;
  dispose: () => void;
};

export function createRefreshScheduler(opts: {
  refresh: (sources: ReadonlySet<string>) => void;
  isHidden: () => boolean;
  debounceMs?: number;
}): RefreshScheduler {
  const wait = opts.debounceMs ?? LIVE_DEBOUNCE_MS;
  let sources = new Set<string>();
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const fire = () => {
    timer = null;
    if (disposed || !pending) return;
    if (opts.isHidden()) return; // stays pending; visibilityChanged() picks it up
    const batch = sources;
    sources = new Set();
    pending = false;
    opts.refresh(batch);
  };
  const arm = () => {
    clear();
    if (!opts.isHidden()) timer = setTimeout(fire, wait);
  };

  return {
    notify(source) {
      if (disposed) return;
      pending = true;
      sources.add(source);
      arm();
    },
    reconnected() {
      if (disposed) return;
      pending = true;
      sources.add("reconnect");
      arm();
    },
    visibilityChanged() {
      if (disposed || !pending || opts.isHidden()) return;
      arm();
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}

/** Realtime is on unless the build opts out (CI's e2e stack has no realtime server; the socket would only log errors). */
export function realtimeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_REALTIME !== "off";
}
