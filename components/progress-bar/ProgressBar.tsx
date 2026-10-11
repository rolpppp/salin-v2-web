import { cn } from "@/lib/cn";
import styles from "./progress-bar.module.css";

export type ProgressBarProps = {
  /** Accessible name, e.g. "This week". */
  label: string;
  value: number;
  max?: number;
  /** Optional human text for assistive tech, e.g. "2 of 5 done". */
  valueText?: string;
  tone?: "accent" | "good";
  /** "loop" is the 8px week-loop bar; "goal" is the 12px goal bar. */
  size?: "loop" | "goal";
  className?: string;
};

export function ProgressBar({ label, value, max = 100, valueText, tone = "accent", size = "loop", className }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const p = clamped / safeMax;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
      className={cn(styles.bar, size === "goal" && styles.goal, tone === "good" && styles.good, className)}
    >
      <i style={{ transform: `scaleX(${p})` }} />
    </div>
  );
}
