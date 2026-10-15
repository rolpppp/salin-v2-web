"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./today.module.css";

type SetViewMode = (input: { mode: "simple" | "full" }) => Promise<{ ok: true } | { ok: false; error: string }>;

/** The way back to Simple view, at the foot of the full Today (the mirror of "Switch to full view" on Simple). */
export function SwitchToSimple({ setViewMode }: { setViewMode: SetViewMode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await setViewMode({ mode: "simple" });
      if (r.ok) router.refresh();
      else setError(r.error);
    } catch {
      setError("Couldn't switch. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.switchFoot}>
      <p className={styles.switchNote}>Want just one number a day?</p>
      <button type="button" className={styles.switchBtn} onClick={() => void go()} disabled={busy} data-testid="to-simple-view">
        Switch to simple view
      </button>
      <p className={styles.switchErr} role="alert">
        {error}
      </p>
    </div>
  );
}
