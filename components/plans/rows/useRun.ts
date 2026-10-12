"use client";

import { useCallback, useState } from "react";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import type { ActionResult } from "@/lib/actions/planResult";

/**
 * Runs one server action at a time for a control: busy while it runs, an inline error when it fails
 * (the caller restores the previous value), and a polite announcement when it works.
 */
export function useRun() {
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(action: () => Promise<ActionResult<T>>, success?: string): Promise<ActionResult<T>> => {
      setBusy(true);
      setError(null);
      let r: ActionResult<T>;
      try {
        r = await action();
      } catch {
        r = { ok: false, error: "Couldn't save. Check your connection and try again." };
      }
      setBusy(false);
      if (r.ok) {
        if (success) announce(success);
      } else {
        setError(r.error);
      }
      return r;
    },
    [announce],
  );
  return { busy, error, setError, run };
}

/** Class-safe hue token for the bucket dot (`--b-living` ...). Unknown hues fall back to a neutral ink. */
export function hueStyle(hue: string | null | undefined): Record<string, string> | undefined {
  return hue && /^[a-z][a-z0-9]{1,19}$/.test(hue) ? { "--c": `var(--b-${hue}, var(--ink-3))` } : undefined;
}
