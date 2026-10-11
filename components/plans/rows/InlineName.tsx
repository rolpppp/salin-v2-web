"use client";

import { useRef, useState } from "react";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import type { ActionResult } from "@/lib/actions/planResult";
import styles from "./plans.module.css";

export type InlineNameProps = {
  /** Screen-reader label, e.g. "Account name". The visible text is the value itself. */
  label: string;
  value: string;
  maxLength?: number;
  /** Saves on blur / Enter. Return the action's result; a failure restores the previous value. */
  onCommit: (next: string) => Promise<ActionResult>;
  /** Announcement after a successful save. */
  saved: (next: string) => string;
};

/**
 * A name that is edited in place and saves on change (SPEC §4: no Save button).
 * Remount it (via `key`) when the saved value changes so the draft follows the server.
 */
export function InlineName({ label, value, maxLength = 60, onCommit, saved }: InlineNameProps) {
  const announce = useAnnounce();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);

  async function commit(raw: string) {
    const next = raw.trim();
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (busy) return;
    if (next === value) {
      setDraft(value);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await onCommit(next);
    setBusy(false);
    if (r.ok) {
      announce(saved(next));
    } else {
      setDraft(value);
      setError(r.error);
    }
  }

  return (
    <div className={styles.stack}>
      <input
        className={styles.nameIn}
        aria-label={label}
        value={draft}
        maxLength={maxLength * 2}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        autoComplete="off"
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onBlur={(e) => void commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(value);
            setError(null);
            e.currentTarget.blur();
          }
        }}
      />
      <p role="alert" className={styles.err}>
        {error}
      </p>
    </div>
  );
}
