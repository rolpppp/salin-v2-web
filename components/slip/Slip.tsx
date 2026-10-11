import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import styles from "./slip.module.css";

export type SlipProps = {
  /** Accessible name, e.g. "Split slip". */
  label: string;
  /** Show the rotated stamp (e.g. "ALL IN", "SPLIT", "WEEK CLOSED"). */
  stamp?: ReactNode;
  /** Small second line under the stamp. */
  stampSub?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Paper object: zigzag edges, Plex Mono, paper drop shadow. */
export function Slip({ label, stamp, stampSub, children, className }: SlipProps) {
  return (
    <div className={cn(styles.shadow, className)}>
      <div className={styles.slip} role="group" aria-label={label}>
        {children}
        {stamp ? (
          <div className={styles.bigstamp} data-on>
            {stamp}
            {stampSub ? <small>{stampSub}</small> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SlipTitle({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn(styles.title, className)} />;
}
export function SlipMeta({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn(styles.meta, className)} />;
}
export function SlipRule() {
  return <div className={styles.rule} aria-hidden="true" />;
}
export function SlipFoot({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...rest} className={cn(styles.foot, className)} />;
}

export type SlipLineProps = {
  label: ReactNode;
  /** Right-hand value, already formatted (use the shared money formatter). */
  value: ReactNode;
  /** Bucket hue as a CSS colour or var(), e.g. "var(--b-living)". Draws the 7px dot. */
  dot?: string;
  /** Percent column, already formatted, e.g. "40%". */
  percent?: ReactNode;
  dim?: boolean;
  total?: boolean;
};

export function SlipLine({ label, value, dot, percent, dim, total }: SlipLineProps) {
  return (
    <div className={cn(styles.ln, dim && styles.dim, total && styles.total)}>
      {dot ? <i className={styles.dotc} style={{ "--c": dot } as CSSProperties} aria-hidden="true" /> : null}
      <span>{label}</span>
      <span className={styles.leader} aria-hidden="true" />
      {percent !== undefined ? <span className={styles.pct}>{percent}</span> : null}
      <span data-amount>{value}</span>
    </div>
  );
}
