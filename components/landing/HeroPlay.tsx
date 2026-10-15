"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { PRESETS, type PresetId } from "@/lib/landing/content";
import { cn } from "@/lib/cn";
import { Odometer } from "./Odometer";
import styles from "./landing.module.css";

const BARS: Record<PresetId, number[]> = {
  allowance: [0.72, 0.5, 0.64, 1, 0.58, 0.58, 0.58],
  stipend: [0.4, 0.86, 0.55, 1, 0.7, 0.62, 0.62],
  salary: [0.9, 0.62, 0.48, 1, 0.66, 0.66, 0.66],
  gigs: [0.35, 0.7, 0.92, 1, 0.52, 0.52, 0.52],
};
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const CATS = [
  { n: "Food", c: "var(--b-living)" },
  { n: "Fun", c: "var(--b-fun)" },
  { n: "School", c: "var(--b-sinking)" },
  { n: "Load", c: "var(--b-invest)" },
];

const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;

/**
 * The hero is the product: pick a situation and the phone's number rolls to that day's amount. The phone is decorative
 * (aria-hidden); the picker is a real radio group with a live summary line for screen readers.
 */
export function HeroPlay() {
  const [id, setId] = useState<PresetId>("allowance");
  // The stamp lands late on first paint (after the number), then quickly on each change.
  const [changed, setChanged] = useState(false);
  const pick = (next: PresetId) => {
    setId(next);
    setChanged(true);
  };
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  const perDay = Math.floor(p.amount / p.days);

  return (
    <div className={styles.play}>
      <div className={styles.halo} aria-hidden="true" />
      <div className={styles.phone} aria-hidden="true">
        <div className={styles.notch} />
        <div className={styles.screen}>
          <div className={styles.scrTop}>
            <span>Good morning, Mika</span>
            <span className={styles.streak}>
              <i /> 5 days
            </span>
          </div>
          <p className={styles.scrLabel}>Left to spend today</p>
          <p className={styles.scrBig}>
            <span className={styles.scrPeso}>₱</span>
            <Odometer value={perDay} />
          </p>
          <p className={styles.scrSub}>
            {peso(p.amount)} {p.every} · lasts until {p.until}
          </p>
          <div className={styles.weekRow}>
            {BARS[id].map((h, i) => (
              <div key={i} className={styles.wk} data-today={i === 3 ? "" : undefined} style={{ "--h": h, "--d": `${380 + i * 50}ms` } as CSSProperties}>
                <i />
                <span>{DAYS[i]}</span>
              </div>
            ))}
          </div>
          <div className={styles.cats}>
            {CATS.map((c, i) => (
              <span key={c.n} className={styles.cat} style={{ "--c": c.c, "--d": `${820 + i * 70}ms` } as CSSProperties}>
                <i /> {c.n}
              </span>
            ))}
          </div>
          <div className={styles.scrBtns}>
            <span className={styles.scrPrimary}>I got money</span>
            <span className={styles.scrSoft}>Log spending</span>
          </div>
        </div>
        <span key={id} className={styles.stamp} style={{ "--sd": changed ? "380ms" : "1500ms" } as CSSProperties}>
          Counted
        </span>
      </div>

      <div className={styles.try}>
        <p className={styles.tryK}>Try it · I get my money as</p>
        <div className={styles.seg} role="radiogroup" aria-label="Try it: how you get your money">
          {PRESETS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === id}
              className={cn(styles.segBtn, x.id === id && styles.segOn)}
              onClick={() => pick(x.id)}
              onKeyDown={(e) => {
                const i = PRESETS.findIndex((q) => q.id === x.id);
                const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % PRESETS.length : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + PRESETS.length) % PRESETS.length : -1;
                if (to < 0) return;
                e.preventDefault();
                pick(PRESETS[to].id);
                (e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus();
              }}
              tabIndex={x.id === id ? 0 : -1}
            >
              {x.label}
            </button>
          ))}
        </div>
        <p className={styles.trySum} aria-live="polite">
          {peso(p.amount)} {p.every} is about <b>{peso(perDay)} a day</b> for {p.days} days.
        </p>
      </div>
    </div>
  );
}
