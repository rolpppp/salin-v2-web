"use client";

import type { OnboardingDraft } from "@/lib/onboarding/draft";
import { previewFirstPay } from "@/lib/onboarding/first-pay";
import { formatPeso } from "@/lib/money";
import styles from "./first-pay.module.css";

/** Whole-permille bar width: integer math, display only. */
const width = (part: number, total: number): string => `${Math.floor((part * 1000) / total) / 10}%`;

/** SPEC §7.5 step 1: bars per bucket from the engine's own split. Confirming stages the choice; nothing is written until Finish. */
export function SplitStage({ draft }: { draft: OnboardingDraft }) {
  const p = previewFirstPay(draft);
  if (!p) {
    return <p className={styles.note}>We can&apos;t work out the split yet. Go back and check your plan and where it lives.</p>;
  }
  return (
    <>
      <ul className={styles.bars} aria-label="Where it goes">
        {p.lines.map((l, i) => (
          <li key={l.bucket} className={styles.barRow} style={{ "--c": `var(--b-${l.bucket})`, "--d": `${i * 60}ms` } as React.CSSProperties}>
            <span className={styles.barName}>
              <i aria-hidden="true" />
              {l.label}
            </span>
            <span className={styles.track} aria-hidden="true">
              <i style={{ "--w": width(l.amountMinor, p.totalMinor) } as React.CSSProperties} />
            </span>
            <span className={styles.barValue} data-amount>
              {formatPeso(l.amountMinor)}
            </span>
          </li>
        ))}
      </ul>
      {p.billsNote ? <p className={styles.note}>{p.billsNote}</p> : null}
    </>
  );
}
