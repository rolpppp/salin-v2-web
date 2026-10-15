"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CheckIcon } from "@/components/icons";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { cn } from "@/lib/cn";
import styles from "./simple-today.module.css";
import type { SimpleActions } from "./types";

/** "No spend today": a quiet toggle. It counts for the day's streak; tapping again undoes it. */
export function NoSpendButton({ day, on, setNoSpend }: { day: string; on: boolean; setNoSpend: SimpleActions["setNoSpend"] }) {
  const announce = useAnnounce();
  const [isOn, setOptimistic] = useOptimistic(on, (_current: boolean, next: boolean) => next);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !isOn;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      try {
        const r = await setNoSpend({ day, on: next });
        if (!r.ok) {
          setError(r.error);
          announce(r.error);
          return;
        }
        announce(next ? "Marked as a no-spend day." : "No-spend day removed.");
      } catch {
        const msg = "Couldn't save. Check your connection and try again.";
        setError(msg);
        announce(msg);
      }
    });
  }

  return (
    <div className={styles.habit}>
      <button type="button" className={cn(styles.linkBtn, isOn && styles.noSpendOn)} aria-pressed={isOn} onClick={toggle} data-testid="no-spend">
        {isOn ? (
          <>
            <CheckIcon aria-hidden="true" />
            &nbsp;No spend today. Undo
          </>
        ) : (
          "No spend today"
        )}
      </button>
      <p className={styles.err} role="alert">
        {error}
      </p>
    </div>
  );
}
