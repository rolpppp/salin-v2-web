"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { formatPeso } from "@/lib/money/format";
import { parseMoney } from "@/lib/money/parse";
import styles from "./steps.module.css";

/**
 * Step fields with a caller-chosen DOM id, because the shell focuses `StepError.field` by id. (`Field`/`MoneyInput` generate
 * their own ids.) Inline errors are not repeated here: the shell shows the step's error above the buttons.
 */

export function StepTextField(props: {
  id: string;
  label: ReactNode;
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
}) {
  return (
    <div className={styles.fld}>
      <label htmlFor={props.id} className={styles.fldLabel}>
        {props.label}
      </label>
      <input
        id={props.id}
        className={styles.text}
        value={props.value}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        autoComplete="off"
        aria-invalid={props.invalid ? true : undefined}
        onChange={(e) => props.onValueChange(e.target.value)}
      />
    </div>
  );
}

const minorToText = (m: number | null): string => (m === null || m === 0 ? "" : formatPeso(m).slice(1).replace(/\.00$/, ""));

export function StepPesoField(props: {
  id: string;
  label: ReactNode;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  hint?: ReactNode;
  minor: number | null;
  onMinor: (minor: number | null) => void;
  /** Called on blur, after the text is reset to the stored value. */
  onBlur?: () => void;
  invalid?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const hintId = `${props.id}-hint`;
  return (
    <div className={styles.fld}>
      <label htmlFor={props.id} className={props.hideLabel ? "sr" : styles.fldLabel}>
        {props.label}
      </label>
      <div className={styles.peso} data-invalid={props.invalid || bad ? true : undefined}>
        <i aria-hidden="true">₱</i>
        <input
          id={props.id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          data-amount
          value={text ?? minorToText(props.minor)}
          aria-invalid={props.invalid || bad ? true : undefined}
          aria-describedby={props.hint ? hintId : undefined}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            if (v.trim() === "") {
              setBad(false);
              props.onMinor(null);
              return;
            }
            const r = parseMoney(v, { requirePositive: false });
            setBad(!r.ok);
            if (r.ok) props.onMinor(r.minor);
          }}
          onBlur={() => {
            setText(null);
            setBad(false);
            props.onBlur?.();
          }}
        />
      </div>
      {bad ? (
        <p role="alert" className={styles.fldErr}>
          Enter an amount like 1,500.00.
        </p>
      ) : null}
      {props.hint ? (
        <p id={hintId} className={styles.fldNote}>
          {props.hint}
        </p>
      ) : null}
    </div>
  );
}
