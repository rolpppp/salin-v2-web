"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { ButtonLink, Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { tickTransferAction, untickTransferAction } from "@/lib/actions/transfers";
import type { MiAccount, MiBucket, MiDone, MiTransferRow, MoneyInPhase } from "@/lib/data/money-in-model";
import { TICK_FAILED, UNTICK_FAILED, applyTick, buildMoveModel, completionLines, sentText, tickAnnouncement, type TransferRowView } from "@/lib/data/transfers-model";
import { formatPeso } from "@/lib/money";
import styles from "./money-in.module.css";
import { StepHead } from "./StepHead";

/**
 * The element the Money in screen focuses after a confirm when no income is left waiting
 * (SPEC §2.3: "else the first transfer checkbox, else the completion card's button").
 * It sits on the first transfer checkbox, or on the completion card's button.
 */
export const MOVE_MONEY_FOCUS_ID = "money-in-move-focus";

export type MoveMoneyStepProps = {
  /**
   * `empty` / `waiting`: nothing confirmed in the open cycle yet, so Step 2 is disabled.
   * `move`: something is confirmed and transfers are still open. `all_done`: the latest cycle closed today
   * (every transfer sent): the step is replaced by the completion card (SPEC §2.4).
   */
  phase: MoneyInPhase;
  /** Incomes confirmed in the latest transfer cycle (P-3), oldest first. Sum of `amountMinor` = "₱X from N sources". */
  confirmed: ReadonlyArray<MiDone>;
  /** The latest transfer cycle (its id is the `periodKey` of its `transfer_checks`), or null before the first confirm. */
  cycle: { id: string; closedAt: number | null } | null;
  /** The latest cycle's checklist as `transfer_plan()` returns it. */
  transferPlan: ReadonlyArray<MiTransferRow>;
  accounts: ReadonlyArray<MiAccount>;
  buckets: ReadonlyArray<MiBucket>;
};

export function MoveMoneyStep({ phase, confirmed, cycle, transferPlan, accounts, buckets }: MoveMoneyStepProps) {
  const announce = useAnnounce();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const busy = useRef(false);
  const [plan, setOptimistic] = useOptimistic(transferPlan, (rows: ReadonlyArray<MiTransferRow>, a: { key: string; sent: number }) => applyTick(rows, a.key, a.sent));
  const model = useMemo(() => buildMoveModel(plan, accounts, buckets), [plan, accounts, buckets]);

  // The completion card celebrates only when this screen watched the transfers finish, not on a later visit.
  const [sawOpen, setSawOpen] = useState(phase !== "all_done");
  if (phase !== "all_done" && !sawOpen) setSawOpen(true);
  const celebrate = phase === "all_done" && sawOpen;
  useEffect(() => {
    if (!celebrate) return;
    announce("All money in has a home.");
    document.getElementById(MOVE_MONEY_FOCUS_ID)?.focus();
  }, [celebrate, announce]);

  function run(row: TransferRowView, tick: boolean) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      setOptimistic({ key: row.key, sent: tick ? row.amount : 0 });
      try {
        const r = tick ? await tickTransferAction({ from: row.from, to: row.to, amount: row.amount }) : await untickTransferAction({ from: row.from, to: row.to });
        if (!r.ok) {
          setError(r.error);
          announce(r.error);
          return;
        }
        // "Already ticked / unticked" is the state the person asked for: not an error.
        const left = model.transfers.filter((t) => (t.key === row.key ? !tick : !t.checked)).length;
        announce(tickAnnouncement(tick, left));
      } catch {
        const msg = tick ? TICK_FAILED : UNTICK_FAILED;
        setError(msg);
        announce(msg);
      } finally {
        busy.current = false;
      }
    });
  }

  if (phase === "all_done") {
    const { headline, lines } = completionLines(confirmed);
    return (
      <Card as="section" aria-labelledby="money-in-peak" className={`${styles.peak}${celebrate ? ` ${styles.peakEnter}` : ""}`} data-testid="completion-card" data-celebrate={celebrate || undefined} data-burst={celebrate ? "payday" : undefined}>
        <h2 id="money-in-peak">{headline}</h2>
        <ul>
          {lines.map((l) => (
            <li key={l}>
              <span className={styles.peakCk} aria-hidden="true">
                <CheckIcon />
              </span>
              {l}
            </li>
          ))}
        </ul>
        <div className={styles.row}>
          <ButtonLink variant="primary" href="/today?grow=confirm" id={MOVE_MONEY_FOCUS_ID} data-testid="see-buckets">
            See your buckets grow <ArrowRightIcon />
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const locked = confirmed.length === 0;
  return (
    <Card as="section" aria-labelledby="money-in-s2" aria-disabled={locked ? true : undefined} className={styles.stepMove} data-testid="move-money-step" data-phase={phase} data-cycle={cycle?.id}>
      <StepHead n={2} id="money-in-s2" headingTabIndex={-1} title="Move the money" sub={locked ? "After you confirm" : <span data-testid="sent-count">{sentText(model.sentCount, model.total)}</span>} />
      {locked ? (
        <p className={styles.muted}>Transfers appear here, grouped by account, once you confirm.</p>
      ) : model.keeps.length + model.transfers.length === 0 ? (
        <p className={styles.muted}>Nothing to send yet.</p>
      ) : (
        <ul className={styles.moves} data-testid="moves" aria-label="Transfers">
          {model.keeps.map((k) => (
            <li key={k.key} className={`${styles.move} ${styles.stays}`} data-testid="keep-row">
              <span className={styles.box} aria-hidden="true">
                <CheckIcon />
              </span>
              <span className={styles.moveT}>
                <b>{k.title}</b>
                <small>{k.detail}</small>
              </span>
              <span className={styles.moveV} data-amount>
                {formatPeso(k.amount)}
              </span>
            </li>
          ))}
          {model.transfers.map((t, i) => {
            const text = `${t.key}-t`;
            return (
              <li key={t.key} className={`${styles.move}${t.checked ? ` ${styles.isDone}` : ""}`} data-testid="transfer-row" data-state={t.checked ? "sent" : t.partial ? "partial" : t.oversent ? "oversent" : "unsent"}>
                <label className={styles.rowLabel}>
                  <input
                    type="checkbox"
                    className={styles.moveInput}
                    id={i === 0 ? MOVE_MONEY_FOCUS_ID : undefined}
                    checked={t.checked}
                    aria-label={t.label}
                    aria-describedby={text}
                    onChange={(e) => run(t, e.currentTarget.checked)}
                  />
                  <span className={styles.box} aria-hidden="true">
                    <CheckIcon />
                  </span>
                  <span className={styles.moveT} id={text}>
                    <b>{t.title}</b>
                    <small>{t.detail}</small>
                  </span>
                  {t.checked ? <span className={styles.stamp}>Sent</span> : null}
                  <span className={styles.moveV} data-amount>
                    {formatPeso(t.amount)}
                  </span>
                </label>
                {t.partial || t.oversent ? (
                  <Button variant="quiet" className={styles.undo} onClick={() => run(t, false)} data-testid="undo-sent">
                    Undo the {formatPeso(t.sent)} sent
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.formError} role="alert" data-testid="move-error">
        {error}
      </p>
    </Card>
  );
}
