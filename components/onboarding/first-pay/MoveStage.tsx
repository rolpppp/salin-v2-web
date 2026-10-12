"use client";

import { useEffect } from "react";
import { CheckIcon } from "@/components/icons";
import { sentText } from "@/lib/data/transfers-model";
import { formatPeso } from "@/lib/money";
import { finalDraft, previewFirstPay, setTick } from "@/lib/onboarding/first-pay";
import type { StepBodyProps } from "@/lib/onboarding/step";
import { useOnboardingEnv } from "../env";
import styles from "./first-pay.module.css";

export const FIRST_TRANSFER_ID = "ob-fp-move-0";

/**
 * SPEC §7.5 step 2: the keep row, one checkbox per transfer, "N of M sent". Ticks are staged in the draft (by account
 * pair); Finish records them as real transfers. Ticking the last one finishes onboarding and shows Done.
 */
export function MoveStage({ draft, update, announce }: StepBodyProps) {
  const { finish, finishing } = useOnboardingEnv();
  const p = previewFirstPay(draft);

  // Focus the first transfer after Confirm split (SPEC §7.7). The shell focuses the question on the same change, so go after it.
  useEffect(() => {
    const id = requestAnimationFrame(() => document.getElementById(FIRST_TRANSFER_ID)?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  if (!p) return null;
  const total = p.transfers.length;

  const tick = (from: string, to: string, on: boolean) => {
    const ticked = setTick(draft.firstPay.ticked, from, to, on);
    const next = { ...draft, firstPay: { ...draft.firstPay, ticked } };
    update({ firstPay: next.firstPay });
    const after = previewFirstPay(next);
    if (after?.allSent) {
      void finish(finalDraft(next), "done");
      return;
    }
    const left = total - (after?.sentCount ?? 0);
    announce(on ? `Sent. ${left} to go.` : "Unticked.");
  };

  return (
    <>
      <ul className={styles.moves} aria-label="Transfers">
        {p.keeps.map((k) => (
          <li key={k.accountId} className={`${styles.move} ${styles.stays}`}>
            <span className={styles.box} aria-hidden="true">
              <CheckIcon />
            </span>
            <span className={styles.moveT}>
              <b>
                Keep {formatPeso(k.amountMinor)} in {k.name}
              </b>
              <small>{[k.labels.join(", "), "already there"].filter(Boolean).join(" · ")}</small>
            </span>
            <span className={styles.moveV} data-amount>
              {formatPeso(k.amountMinor)}
            </span>
          </li>
        ))}
        {p.transfers.map((t, i) => {
          const title = `Send ${formatPeso(t.amountMinor)} to ${t.toName}`;
          const descId = `ob-fp-move-${i}-t`;
          return (
            <li key={t.key} className={`${styles.move}${t.ticked ? ` ${styles.isDone}` : ""}`} data-state={t.ticked ? "sent" : "unsent"}>
              <label className={styles.rowLabel}>
                <input
                  type="checkbox"
                  className={styles.moveInput}
                  id={`ob-fp-move-${i}`}
                  checked={t.ticked}
                  disabled={finishing}
                  aria-label={title}
                  aria-describedby={descId}
                  onChange={(e) => tick(t.fromAccountId, t.toAccountId, e.currentTarget.checked)}
                />
                <span className={styles.box} aria-hidden="true">
                  <CheckIcon />
                </span>
                <span className={styles.moveT} id={descId}>
                  <b>{title}</b>
                  <small>{[t.labels.join(", "), `from ${t.fromName}`].filter(Boolean).join(" · ")}</small>
                </span>
                {t.ticked ? <span className={styles.stamp}>Sent</span> : null}
                <span className={styles.moveV} data-amount>
                  {formatPeso(t.amountMinor)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className={styles.count} aria-live="polite">
        {sentText(p.sentCount, total)}
      </p>
    </>
  );
}
