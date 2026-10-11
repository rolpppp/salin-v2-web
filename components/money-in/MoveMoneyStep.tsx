import { Card } from "@/components/card/Card";
import type { MiDone, MoneyInPhase } from "@/lib/data/money-in-model";
import styles from "./money-in.module.css";
import { StepHead } from "./StepHead";

/**
 * The element the Money in screen focuses after a confirm when no income is left waiting
 * (SPEC §2.3: "else the first transfer checkbox, else the completion card's button").
 * Ticket 11: put this id on the first transfer checkbox, or on the completion card's button.
 */
export const MOVE_MONEY_FOCUS_ID = "money-in-move-focus";

export type MoveMoneyStepProps = {
  /**
   * `empty` / `waiting`: nothing confirmed in the open cycle yet, so Step 2 is disabled.
   * `move`: something is confirmed and transfers are still open. `all_done`: the latest cycle closed today
   * (every transfer sent): replace the step with the completion card (SPEC §2.4).
   */
  phase: MoneyInPhase;
  /** Incomes confirmed in the latest transfer cycle (P-3), oldest first. Sum of `amountMinor` = "₱X from N sources". */
  confirmed: ReadonlyArray<MiDone>;
  /** The latest transfer cycle (its id is the `periodKey` of its `transfer_checks`), or null before the first confirm. */
  cycle: { id: string; closedAt: number | null } | null;
};

/**
 * PLACEHOLDER. Step 2, "Move the money", is ticket 11 (transfer checklist: keep rows, transfer rows, netting,
 * ticking, completion card). This component only holds its place and its props contract; ticket 11 replaces
 * the body and keeps the props (add what it needs, e.g. transfer rows read via `transfer_plan()`).
 */
export function MoveMoneyStep({ phase, confirmed, cycle }: MoveMoneyStepProps) {
  const locked = confirmed.length === 0;
  return (
    <Card as="section" aria-labelledby="money-in-s2" aria-disabled={locked ? true : undefined} className={styles.stepMove} data-testid="move-money-step" data-phase={phase}>
      <StepHead n={2} id="money-in-s2" title="Move the money" sub={locked ? "After you confirm" : undefined} />
      {locked ? (
        <p className={styles.muted}>Transfers appear here, grouped by account, once you confirm.</p>
      ) : (
        <div className={styles.placeholder} data-testid="move-money-placeholder">
          <b id={MOVE_MONEY_FOCUS_ID} tabIndex={-1}>
            Placeholder: the transfer checklist arrives in ticket 11.
          </b>
          <span>
            {confirmed.length} {confirmed.length === 1 ? "income is" : "incomes are"} confirmed{cycle ? ` in this cycle${cycle.closedAt === null ? "" : " (closed)"}` : ""}. Nothing is shown to tick yet.
          </span>
        </div>
      )}
    </Card>
  );
}
