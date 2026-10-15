"use client";

import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { CheckIcon } from "@/components/icons";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { formatPeso } from "@/lib/money";
import type { SavedMove } from "./ReceiveMoney";
import styles from "./simple-today.module.css";
import type { SimpleActions } from "./types";

const FAILED = "Couldn't mark it. You can also do it in Money in.";

/** After "I got money": each amount that landed in one account but belongs in another, with a tick to say it was sent. */
export function MovesCard({ moves, tick }: { moves: SavedMove[]; tick: SimpleActions["tickTransfer"] }) {
  const announce = useAnnounce();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (moves.length === 0) return null;
  const key = (m: SavedMove) => `${m.from}>${m.to}`;

  async function send(m: SavedMove) {
    if (busy) return;
    setBusy(key(m));
    setError(null);
    try {
      const r = await tick({ from: m.from, to: m.to, amount: m.amountMinor });
      if (!r.ok) {
        setError(r.error || FAILED);
        announce(r.error || FAILED);
        return;
      }
      setSent((s) => ({ ...s, [key(m)]: true }));
      announce(`Marked ${formatPeso(m.amountMinor)} to ${m.toName} as sent.`);
    } catch {
      setError(FAILED);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card as="section" aria-labelledby="simple-moves-h" className={styles.moveCard} data-testid="moves-card">
      <div className={styles.cardHead}>
        <h2 id="simple-moves-h">Move your money</h2>
      </div>
      {moves.map((m) => (
        <div key={key(m)} className={styles.moveRow} data-testid="move-row">
          <span>
            Move <b>{formatPeso(m.amountMinor)}</b> from {m.fromName} to {m.toName}
          </span>
          {sent[key(m)] ? (
            <span className={styles.moveSent} data-testid="move-sent">
              <CheckIcon /> Sent
            </span>
          ) : (
            <Button variant="soft" loading={busy === key(m)} loadingLabel="Saving" onClick={() => void send(m)} data-testid="move-tick">
              Mark as sent
            </Button>
          )}
        </div>
      ))}
      <p className={styles.err} role="alert" data-testid="move-error">
        {error}
      </p>
    </Card>
  );
}
