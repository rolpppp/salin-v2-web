"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import styles from "./segmented-control.module.css";

export type SegmentedOption<V extends string> = { value: V; label: string; disabled?: boolean };

export type SegmentedControlProps<V extends string> = {
  /** Accessible name for the group. */
  label: string;
  options: ReadonlyArray<SegmentedOption<V>>;
  value: V;
  onValueChange: (value: V) => void;
  className?: string;
};

/**
 * Radio group styled as a segmented control. One tab stop (the checked option);
 * Arrow keys move and select (wrapping), Home/End jump to first/last.
 */
export function SegmentedControl<V extends string>({ label, options, value, onValueChange, className }: SegmentedControlProps<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = options.findIndex((o) => o.value === value);
    const pos = enabled.indexOf(current);
    let nextPos: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") nextPos = (pos + 1) % enabled.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextPos = (pos - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") nextPos = 0;
    else if (e.key === "End") nextPos = enabled.length - 1;
    if (nextPos === null || enabled.length === 0) return;
    e.preventDefault();
    const idx = enabled[nextPos];
    onValueChange(options[idx].value);
    refs.current[idx]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn(styles.seg, className)} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={o.disabled}
            className={styles.btn}
            onClick={() => onValueChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
