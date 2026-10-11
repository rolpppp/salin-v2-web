import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import styles from "./chip.module.css";

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  /** plan: Sea Glass with teal dot. neutral: quiet fill. milestone: Payday Sun (earned only). */
  tone?: "plan" | "neutral" | "milestone";
  /** Show the 7px dot (default on for "plan"). */
  dot?: boolean;
};

export function Chip({ tone = "plan", dot, className, children, ...rest }: ChipProps) {
  const showDot = dot ?? tone === "plan";
  return (
    <span {...rest} className={cn(styles.chip, styles[tone], className)}>
      {showDot ? <i aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
