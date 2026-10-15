"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button/Button";
import { Greeting } from "@/components/today/Greeting";
import { AccountsCard } from "./AccountsCard";
import { Hero } from "./Hero";
import { MovesCard } from "./MovesCard";
import { NoSpendButton } from "./NoSpendButton";
import { ReceiveMoney, type SavedMove } from "./ReceiveMoney";
import { StreakChip } from "./StreakChip";
import { WeekStrip } from "./WeekStrip";
import styles from "./simple-today.module.css";
import type { SimpleActions, SimpleTodayModel } from "./types";

const MILESTONE_KEY = "salin.simple.milestone";

/**
 * The calm daily view: one big number, the week, two actions, a quiet habit, and where your money is.
 * Presentational: it takes the model and the actions as props. `logSlot` is the existing Log spending launcher.
 */
export function SimpleToday({ model, actions, logSlot }: { model: SimpleTodayModel; actions: SimpleActions; logSlot: ReactNode }) {
  const router = useRouter();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  const [moves, setMoves] = useState<SavedMove[]>([]);
  const [burst, setBurst] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const receiveBtn = useRef<HTMLElement | null>(null);

  // A streak milestone (3, 7, 14, 30) gets the existing burst once, then is remembered on this device.
  const milestone = model.streak.milestone;
  useEffect(() => {
    if (!milestone) return;
    try {
      if (window.localStorage.getItem(MILESTONE_KEY) === String(milestone)) return;
      window.localStorage.setItem(MILESTONE_KEY, String(milestone));
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a per-device flag that only exists in the browser
    setBurst(true);
  }, [milestone]);

  const today = model.week.find((d) => d.state === "today")?.day ?? "";
  const { streak } = model;

  async function toFull() {
    if (switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      const r = await actions.setViewMode({ mode: "full" });
      if (!r.ok) {
        setSwitchError(r.error);
        return;
      }
      router.refresh();
    } catch {
      setSwitchError("Couldn't switch. Check your connection and try again.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className={styles.wrap} data-testid="simple-today">
      <Greeting firstName={model.firstName || null}>
        <StreakChip days={streak.days} todayDone={streak.todayDone} />
      </Greeting>

      <Hero model={model} actions={actions} burst={burst} />

      {moves.length > 0 ? <MovesCard moves={moves} tick={actions.tickTransfer} /> : null}

      <WeekStrip week={model.week} />

      <div className={styles.actions}>
        <Button
          variant="primary"
          aria-haspopup="dialog"
          data-testid="i-got-money"
          onClick={(e) => {
            receiveBtn.current = e.currentTarget;
            setOpening((n) => n + 1);
            setReceiveOpen(true);
          }}
        >
          I got money
        </Button>
        <div className={styles.logCell}>{logSlot}</div>
      </div>

      <div className={styles.habit}>
        <NoSpendButton key={`${today}-${streak.noSpendToday}`} day={today} on={streak.noSpendToday} setNoSpend={actions.setNoSpend} />
        <p className={styles.habitNote} data-testid="habit-note">
          {streak.todayDone ? "Today is counted." : "Nothing yet today. Log it or mark a no-spend day."}
        </p>
      </div>

      <AccountsCard model={model} />

      <div className={styles.foot}>
        <button type="button" className={styles.linkBtn} onClick={() => void toFull()} disabled={switching} data-testid="to-full-view">
          Switch to full view
        </button>
        <p className={styles.err} role="alert">
          {switchError}
        </p>
      </div>

      <ReceiveMoney
        key={opening}
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        model={model}
        actions={actions}
        launcher={() => receiveBtn.current}
        onSaved={(m) => setMoves(m)}
      />
    </div>
  );
}
