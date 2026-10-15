"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AUDIENCES, type AudienceId } from "@/lib/landing/content";
import { cn } from "@/lib/cn";
import { BagIcon, CapIcon, CheckIcon, SproutIcon } from "./icons";
import styles from "./landing.module.css";

const ICONS = { cap: CapIcon, bag: BagIcon, sprout: SproutIcon } as const;

/**
 * "Is this for me?": three situations, one panel. A real tablist (arrow keys move and select), so it works without a mouse.
 * Switching crossfades the panel (a short rise, no layout jump: the panel keeps its height).
 */
export function Audience() {
  const [active, setActive] = useState<AudienceId>("students");
  const base = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = AUDIENCES.find((a) => a.id === active) ?? AUDIENCES[0];

  function onKeyDown(e: KeyboardEvent, i: number) {
    const last = AUDIENCES.length - 1;
    const to = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (to === null) return;
    e.preventDefault();
    setActive(AUDIENCES[to].id);
    tabs.current[to]?.focus();
  }

  return (
    <div className={styles.aud}>
      <div className={styles.tabs} role="tablist" aria-label="Who is Salin for?">
        {AUDIENCES.map((a, i) => {
          const Icon = ICONS[a.icon];
          const on = a.id === active;
          return (
            <button
              key={a.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-tab-${a.id}`}
              aria-selected={on}
              aria-controls={`${base}-panel`}
              tabIndex={on ? 0 : -1}
              className={cn(styles.tab, on && styles.tabOn)}
              onClick={() => setActive(a.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <Icon width={20} height={20} />
              {a.label}
            </button>
          );
        })}
      </div>

      <div className={styles.panel} role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`}>
        <div key={current.id} className={styles.panelIn}>
          <div>
            <h3 className={styles.panelH}>{current.headline}</h3>
            <p className={styles.panelP}>{current.body}</p>
            <ul className={styles.ticks}>
              {current.points.map((p) => (
                <li key={p}>
                  <span aria-hidden="true">
                    <CheckIcon width={13} height={13} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.demo} aria-hidden="true">
            <p className={styles.demoLabel}>{current.demo.label}</p>
            <p className={styles.demoValue}>{current.demo.value}</p>
            <p className={styles.demoNote}>{current.demo.note}</p>
            <div className={styles.demoBars}>
              {[0.5, 0.8, 0.62, 1, 0.7, 0.55, 0.66].map((h, i) => (
                <i key={i} style={{ "--h": h, "--d": `${i * 45}ms` } as React.CSSProperties} data-hot={i === 3 ? "" : undefined} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
