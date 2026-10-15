"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Drawer } from "@/components/drawer/Drawer";
import { Field, Input } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { cn } from "@/lib/cn";
import { MINUS, formatPeso, formatPesoWhole } from "@/lib/money";
import { addDays, floorDiv } from "@/lib/money/core";
import { useCountUp } from "@/lib/motion/useCountUp";
import styles from "./simple-today.module.css";
import type { SimpleActions, SimpleTodayModel } from "./types";

const COUNT_MS = 900;

/** One big number: what is left to spend today. It counts up (or down) when the number changes, never on first paint. */
export function Hero({ model, actions, burst }: { model: SimpleTodayModel; actions: SimpleActions; burst: boolean }) {
  const value = model.todayLeftMinor;
  const negative = value < 0;
  // Whole pesos are the big number; the centavos sit small beside it. The count-up runs over whole pesos.
  const full = formatPeso(Math.abs(value)).slice(1);
  const digits = full.slice(0, -3);
  const cents = full.slice(-3);
  const digitsRef = useRef<HTMLSpanElement>(null);

  // Derived state: remember the last value, and when it changes animate from it. The hook only paints frames
  // over the final text, and is off under reduced motion.
  const [seen, setSeen] = useState(value);
  const [anim, setAnim] = useState<number | null>(null);
  if (value !== seen) {
    setAnim(seen);
    setSeen(value);
  }
  useEffect(() => {
    if (anim === null) return;
    const t = setTimeout(() => setAnim(null), COUNT_MS + 200);
    return () => clearTimeout(t);
  }, [anim]);
  useCountUp(digitsRef, {
    active: anim !== null,
    from: anim === null ? 0 : floorDiv(Math.abs(anim), 100),
    to: floorDiv(Math.abs(value), 100),
    format: (n) => formatPeso(n * 100).slice(1, -3),
    finalText: digits,
    durationMs: COUNT_MS,
  });

  const [open, setOpen] = useState(false);
  const untilBtn = useRef<HTMLButtonElement>(null);
  const days = model.daysUntil;

  return (
    <Card as="section" aria-labelledby="simple-hero-h" className={cn(styles.hero, negative && styles.heroNeg)} data-testid="hero" data-tour="hero" data-spendable-left-minor={model.spendableLeftMinor} data-days-until={model.daysUntil} data-burst={burst ? "week" : undefined}>
      <h2 className={styles.eyebrow} id="simple-hero-h">
        Left to spend today
      </h2>
      <p className={cn(styles.big, negative && styles.neg)} data-testid="today-left" data-today-left-minor={value}>
        {negative ? MINUS : ""}
        <span className={styles.cur}>₱</span>
        <span ref={digitsRef}>{digits}</span>
        <span className={styles.cents}>{cents}</span>
      </p>
      {negative ? <p className={styles.heroNote}>{formatPeso(Math.abs(value))} over. Tomorrow adjusts.</p> : null}
      <dl className={styles.heroStats}>
        <div>
          <dt>Left this week</dt>
          <dd data-testid="week-left" data-week-left-minor={model.weekLeftMinor}>
            {formatPeso(model.weekLeftMinor)}
          </dd>
        </div>
        <div>
          <dt>About a day</dt>
          <dd data-testid="pace" data-pace-minor={model.paceMinor}>
            {formatPesoWhole(model.paceMinor)}
          </dd>
        </div>
      </dl>
      <button ref={untilBtn} type="button" className={styles.untilBtn} aria-haspopup="dialog" onClick={() => setOpen(true)} data-testid="until-button">
        {days} {days === 1 ? "day" : "days"} until {model.until.label}
        <span aria-hidden="true" className={styles.untilEdit}>
          Change
        </span>
      </button>
      <UntilSheet open={open} onOpenChange={setOpen} model={model} actions={actions} returnTo={() => untilBtn.current} />
    </Card>
  );
}

/** Make it last until: end of this week, or any date (a stipend months away works the same). */
function UntilSheet({ open, onOpenChange, model, actions, returnTo }: { open: boolean; onOpenChange: (o: boolean) => void; model: SimpleTodayModel; actions: SimpleActions; returnTo: () => HTMLElement | null }) {
  const announce = useAnnounce();
  const todayIso = model.week.find((d) => d.state === "today")?.day ?? model.week[0]?.day ?? "";
  const weekEnd = model.week[model.week.length - 1]?.day ?? todayIso;
  const nextWeekStart = addDays(weekEnd, 1);
  const tomorrow = addDays(todayIso, 1);
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(model.until.day);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"week" | "date" | null>(null);

  async function choose(day: string, which: "week" | "date") {
    if (busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < tomorrow) {
      setError("Pick a day after today.");
      return;
    }
    setError(null);
    setBusy(which);
    try {
      const r = await actions.setSpendUntil({ day });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      announce("Updated. Your daily amount changed to match.");
      onOpenChange(false);
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Make it last until" description="Pick the day your next money arrives. That day is not counted." returnFocus={returnTo}>
      <div className={styles.form} data-testid="until-sheet">
        <p className={styles.muted}>Your spending money is spread over the days before your next money arrives.</p>
        <div className={styles.chips}>
          <Button variant="soft" loading={busy === "week"} loadingLabel="Saving" onClick={() => void choose(nextWeekStart, "week")} data-testid="until-week">
            End of this week
          </Button>
          <Button variant="soft" aria-expanded={picking} onClick={() => setPicking((p) => !p)} data-testid="until-pick">
            A date…
          </Button>
        </div>
        {picking ? (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void choose(date, "date");
            }}
          >
            <Field label="The day your next money arrives" hint="That day is not counted." error={error}>
              {(c) => <Input {...c} type="date" name="until" value={date} min={tomorrow} onChange={(e) => setDate(e.target.value)} data-testid="until-date" />}
            </Field>
            <Button type="submit" variant="primary" loading={busy === "date"} loadingLabel="Saving" data-testid="until-save">
              Use this date
            </Button>
          </form>
        ) : error ? (
          <p className={styles.err} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
