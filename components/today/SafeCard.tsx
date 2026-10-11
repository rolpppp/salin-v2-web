import { Card } from "@/components/card/Card";
import { MINUS, formatPeso, formatPesoWhole } from "@/lib/money";
import type { SafeView } from "@/lib/data/today-model";
import { cn } from "@/lib/cn";
import styles from "./today.module.css";

export type Flash = { tone: "good" | "warm"; text: string };

/** Safe to spend (BR §4.4): big number, day strip ending in Pay, per-day line, and the two leaders. */
export function SafeCard({ safe, flash }: { safe: SafeView | null; flash: Flash | null }) {
  if (!safe) {
    return (
      <Card className={styles.safe} aria-labelledby="safe-h">
        <h2 className={styles.eyebrow} id="safe-h">
          Safe to spend
        </h2>
        <p className={styles.muted}>Safe to spend shows here once your plan has Living or Fun money.</p>
      </Card>
    );
  }
  const negative = safe.safeMinor < 0;
  const digits = formatPeso(Math.abs(safe.safeMinor)).slice(1);
  return (
    <Card className={styles.safe} aria-labelledby="safe-h">
      <h2 className={styles.eyebrow} id="safe-h">
        Safe to spend
      </h2>
      <p className={cn(styles.big, negative && styles.neg)} data-testid="safe-amount" data-safe-minor={safe.safeMinor}>
        {negative ? MINUS : ""}
        <span className={styles.cur}>₱</span>
        {digits}
      </p>
      <p className={styles.safeSub}>{safe.caption}</p>
      {safe.perDayText ? (
        <div className={styles.pace}>
          <div className={styles.paceDays} aria-hidden="true" style={{ gridTemplateColumns: `repeat(${safe.strip.length}, minmax(0, 1fr))` }}>
            {safe.strip.map((d, i) => (
              <span key={i} className={d.pay ? styles.pay : undefined}>
                <i />
                {d.label}
              </span>
            ))}
          </div>
          <div className={styles.paceCap}>
            <span data-testid="per-day">
              About <b>{formatPesoWhole(safe.perDayMinor ?? 0)}</b>
              {safe.daysUntilPayday === 0 ? " for today" : ` a day for ${safe.daysUntilPayday} day${safe.daysUntilPayday === 1 ? "" : "s"}`}
            </span>
            {safe.paydayLabel ? <span>{safe.paydayLabel}</span> : null}
          </div>
        </div>
      ) : null}
      <div className={styles.away}>
        <div className={styles.leader}>
          <span>Put away in {safe.month}</span>
          <span className={styles.dots} aria-hidden="true" />
          <b data-testid="put-away">{formatPeso(safe.putAwayMinor)}</b>
        </div>
        {safe.taxMinor !== null ? (
          <div className={styles.leader}>
            <span>Set aside for tax</span>
            <span className={styles.dots} aria-hidden="true" />
            <span className={styles.plain} data-testid="tax-set-aside">
              {formatPeso(safe.taxMinor)}
            </span>
          </div>
        ) : null}
      </div>
      {flash ? (
        <div className={cn(styles.flag, flash.tone === "warm" && styles.flagWarm)} data-testid="cover-flag">
          <span>{flash.text}</span>
        </div>
      ) : null}
    </Card>
  );
}
