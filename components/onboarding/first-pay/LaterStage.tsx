"use client";

import type { StepBodyProps } from "@/lib/onboarding/step";
import styles from "./first-pay.module.css";

const OPTIONS = [
  { value: "email", label: "Email me on payday" },
  { value: "none", label: "No reminder" },
] as const;

/** SPEC §7.5 step 4: "Not yet" / "Do it later". The reminder is the only question; Open Today finishes. */
export function LaterStage({ draft, update }: StepBodyProps) {
  const f = draft.firstPay;
  return (
    <>
      <fieldset className={styles.fs}>
        <legend>Remind me</legend>
        <div className={styles.chips}>
          {OPTIONS.map((o) => (
            <label key={o.value} className={styles.chip}>
              <input type="radio" name="ob-fp-remind" value={o.value} checked={f.reminder === o.value} onChange={() => update({ firstPay: { ...f, reminder: o.value } })} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {draft.path === "app" ? <p className={styles.note}>Your pay waits in Money in. Give it a job there whenever you&apos;re ready.</p> : null}
    </>
  );
}
