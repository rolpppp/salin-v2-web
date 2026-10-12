"use client";

import { useId } from "react";
import { CUSTOM_HUES, HUE_LABELS } from "@/lib/data/hues";
import styles from "./split.module.css";

type Props = {
  value: string;
  onChange: (hue: string) => void;
  disabled?: boolean;
  /** Shown under the swatches, e.g. why they are disabled. */
  hint?: string;
  legend?: string;
};

/** Colour swatches c1..c8 as native radio inputs. Each has a text label (screen readers) and a ring + tick when chosen (not colour alone). */
export function HuePicker({ value, onChange, disabled, hint, legend = "Colour" }: Props) {
  const name = useId();
  const hintId = `${name}-hint`;
  return (
    <fieldset className={styles.fieldset} disabled={disabled} aria-describedby={hint ? hintId : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.swatches}>
        {CUSTOM_HUES.map((h) => (
          <label key={h} className={styles.swatch} style={{ "--c": `var(--b-${h})` } as React.CSSProperties}>
            <input type="radio" name={name} value={h} checked={value === h} onChange={() => onChange(h)} />
            <span className={styles.swatchDot} aria-hidden="true" />
            <span className="sr">{HUE_LABELS[h]}</span>
          </label>
        ))}
      </div>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
