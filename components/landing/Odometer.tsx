import type { CSSProperties } from "react";
import styles from "./landing.module.css";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * Rolling digits (each digit is a 0–9 strip moved with transform). Columns are keyed from the right, so "214" → "1,666"
 * rolls the shared columns instead of remounting. Screen readers get the plain number once.
 */
export function Odometer({ value, className }: { value: number; className?: string }) {
  const text = Math.max(0, Math.floor(value)).toLocaleString("en-PH");
  const chars = [...text];
  return (
    <span className={className ? `${styles.odo} ${className}` : styles.odo}>
      <span className="sr">{text}</span>
      <span aria-hidden="true" className={styles.odoRow}>
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          if (!/\d/.test(ch)) {
            return (
              <span key={`s${fromRight}`} className={styles.odoSep}>
                {ch}
              </span>
            );
          }
          return (
            <span key={`d${fromRight}`} className={styles.odoCol}>
              <span className={styles.odoStrip} style={{ "--v": Number(ch), "--k": fromRight } as CSSProperties}>
                {DIGITS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
