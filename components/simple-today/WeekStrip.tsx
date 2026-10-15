"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/card/Card";
import { Drawer } from "@/components/drawer/Drawer";
import { cn } from "@/lib/cn";
import { MINUS, formatPeso } from "@/lib/money";
import { floorDiv } from "@/lib/money/core";
import styles from "./simple-today.module.css";
import type { DayItem, SimpleTodayModel } from "./types";

type Day = SimpleTodayModel["week"][number] & { items?: DayItem[] };

/** Whole pesos, short enough for a 7-column strip: ₱569, ₱12k. Floors toward zero-or-below, never overstates. */
export function dayAmount(minor: number): string {
  const pesos = floorDiv(minor, 100);
  const abs = Math.abs(pesos);
  const text = abs >= 10_000 ? `${floorDiv(abs, 1000)}k` : String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${pesos < 0 ? MINUS : ""}₱${text}`;
}

const shown = (d: Day): number => (d.state === "past" ? d.spentMinor : (d.leftMinor ?? 0));

/** Seven days from the week's first day: past = what was spent, today = ring, future = the current daily amount. */
export function WeekStrip({ week }: { week: SimpleTodayModel["week"] }) {
  const days = week as Day[];
  const max = Math.max(1, ...days.map((d) => Math.max(0, shown(d))));
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const open = days.find((d) => d.day === openDay) ?? null;
  const lastButton = useRef<HTMLElement | null>(null);

  return (
    <Card as="section" aria-labelledby="simple-week-h" className={styles.stripCard} data-testid="week-strip">
      <div className={styles.stripHead}>
        <h2 id="simple-week-h">This week</h2>
        <span>Tap a day</span>
      </div>
      <ul className={styles.strip}>
        {days.map((d) => {
          const v = shown(d);
          const pct = v <= 0 ? 0 : Math.max(6, Math.round((v * 100) / max));
          const neg = d.state !== "past" && v < 0;
          const text = d.state === "past" ? `${d.label}, spent ${formatPeso(d.spentMinor)}` : d.state === "today" ? `${d.label}, today, ${formatPeso(v)} left` : `${d.label}, about ${formatPeso(v)} a day`;
          return (
            <li key={d.day}>
              <button
                type="button"
                className={cn(styles.day, styles[d.state])}
                aria-label={text}
                aria-current={d.state === "today" ? "date" : undefined}
                aria-haspopup="dialog"
                data-testid={`day-${d.state}`}
                data-day={d.day}
                onClick={(e) => {
                  lastButton.current = e.currentTarget;
                  e.currentTarget.focus();
                  setOpenDay(d.day);
                  setIsOpen(true);
                }}
              >
                <span aria-hidden="true">{d.label}</span>
                <span className={styles.dayTrack} aria-hidden="true">
                  <span className={styles.dayFill} style={{ height: `${pct}%` }} />
                </span>
                <span className={cn(styles.dayAmt, neg && styles.neg)} aria-hidden="true">
                  {dayAmount(v)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Drawer open={isOpen && open !== null} onOpenChange={setIsOpen} title={open ? dayTitle(open) : ""} description={open ? `What was spent and what is left on ${open.label}.` : undefined} returnFocus={() => lastButton.current}>
        {open ? <DayBody day={open} /> : null}
      </Drawer>
    </Card>
  );
}

function dayTitle(d: Day): string {
  return d.state === "today" ? `${d.label}, today` : d.label;
}

function DayBody({ day }: { day: Day }) {
  return (
    <div data-testid="day-sheet">
      <div className={styles.dayStat}>
        <span>Spent</span>
        <b data-testid="day-spent">{formatPeso(day.spentMinor)}</b>
      </div>
      {day.state === "today" ? (
        <div className={styles.dayStat}>
          <span>Left today</span>
          <b className={(day.leftMinor ?? 0) < 0 ? styles.neg : undefined}>{formatPeso(day.leftMinor ?? 0)}</b>
        </div>
      ) : null}
      {day.state === "future" ? (
        <div className={styles.dayStat}>
          <span>About a day</span>
          <b>{formatPeso(day.leftMinor ?? 0)}</b>
        </div>
      ) : null}
      {day.items && day.items.length > 0 ? (
        <ul className={styles.list} aria-label="Spending">
          {day.items.map((it) => (
            <li key={it.id} className={styles.row}>
              <span className={styles.rowMain}>
                <b>{it.label}</b>
              </span>
              <span className={styles.amt}>{formatPeso(it.amountMinor)}</span>
            </li>
          ))}
        </ul>
      ) : day.spentMinor === 0 && day.state !== "future" ? (
        <p className={styles.muted}>Nothing logged on this day.</p>
      ) : day.state === "future" ? (
        <p className={styles.muted}>This is what you can spend each day if nothing changes. It moves as you spend.</p>
      ) : null}
    </div>
  );
}
