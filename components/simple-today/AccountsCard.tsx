import Link from "next/link";
import { Card } from "@/components/card/Card";
import { formatPeso } from "@/lib/money";
import styles from "./simple-today.module.css";
import type { SimpleTodayModel } from "./types";

/** Where your money is: real balances, and a quiet line for money that still has to be moved (opens the transfer checklist). */
export function AccountsCard({ model }: { model: SimpleTodayModel }) {
  return (
    <Card as="section" aria-labelledby="simple-accounts-h" data-testid="accounts-card">
      <div className={styles.cardHead}>
        <h2 id="simple-accounts-h">Where your money is</h2>
      </div>
      {!model.hasAccounts || model.accounts.length === 0 ? (
        <p className={styles.muted}>
          Add an account first, then your money shows up here. <Link href="/plans/accounts">Go to Accounts</Link>
        </p>
      ) : (
        <ul className={styles.list}>
          {model.accounts.map((a) => (
            <li key={a.id} className={styles.row} data-testid="account-row">
              <span className={styles.rowMain}>
                <b>{a.name}</b>
                {a.pendingOutMinor > 0 ? (
                  <Link href="/money-in" className={styles.pending} data-testid="pending-out">
                    {formatPeso(a.pendingOutMinor)} to move out
                  </Link>
                ) : null}
                {a.pendingInMinor > 0 ? (
                  <Link href="/money-in" className={styles.pending} data-testid="pending-in">
                    {formatPeso(a.pendingInMinor)} to move here
                  </Link>
                ) : null}
              </span>
              <span className={styles.amt} data-amount>
                {formatPeso(a.balanceMinor)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {model.keptAsideMinor > 0 ? (
        <p className={styles.kept} data-testid="kept-aside">
          <span>Kept aside</span>
          <b>{formatPeso(model.keptAsideMinor)}</b>
        </p>
      ) : null}
    </Card>
  );
}
