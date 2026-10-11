import { Button } from "@/components/button/Button";
import { cn } from "@/lib/cn";
import type { DrawerView } from "@/lib/data/today-model";
import { formatPeso } from "@/lib/money";
import styles from "./today.module.css";

const signed = (minor: number) => (minor > 0 ? `+${formatPeso(minor)}` : formatPeso(minor));

export type BucketDrawerBodyProps = {
  view: DrawerView;
  onCover: (toBucketId: string) => void;
  coverBusy: boolean;
  coverError: string | null;
};

/** Inside the Drawer (SPEC §1): where it's kept, Left, note, plan percentages, this month's slip, and Cover. */
export function BucketDrawerBody({ view: v, onCover, coverBusy, coverError }: BucketDrawerBodyProps) {
  return (
    <>
      {v.keptIn ? <p className={styles.dKept}>Kept in {v.keptIn}</p> : null}
      <div>
        <p className={styles.dLeftLabel}>Left</p>
        <p className={cn(styles.dLeft, v.leftMinor < 0 && styles.neg)} data-testid="drawer-left">
          {formatPeso(v.leftMinor)}
        </p>
        {v.needsMinor > 0 ? <p className={styles.dNeeds}>Needs {formatPeso(v.needsMinor)}</p> : null}
      </div>
      <p className={styles.muted}>
        {v.note ? `${v.note} ` : ""}
        {v.planText}
      </p>
      <div className={styles.dLines} data-testid="drawer-lines">
        {v.lines.length === 0 ? (
          <span className={styles.dNone}>Nothing in or out in {v.monthName}.</span>
        ) : (
          <ul aria-label={`${v.name} in ${v.monthName}`}>
            {v.lines.map((l, i) => (
              <li key={i} className={l.amountMinor > 0 ? styles.dIn : undefined}>
                <span>{l.label}</span>
                <span className={styles.dots} aria-hidden="true" />
                <span>{signed(l.amountMinor)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.dRule} />
        <div className={styles.dTotal}>
          <span>Left</span>
          <span className={styles.dots} aria-hidden="true" />
          <span>{formatPeso(v.leftMinor)}</span>
        </div>
      </div>
      {v.cover ? (
        <div className={styles.dCover}>
          {v.cover.coverMinor > 0 ? (
            <>
              <Button variant="primary" loading={coverBusy} loadingLabel="Covering" onClick={() => onCover(v.cover!.toBucketId)} data-testid="drawer-cover">
                Cover {formatPeso(v.cover.coverMinor)} from {v.cover.fromName}
              </Button>
              {v.cover.stillNeededMinor > 0 ? (
                <p className={styles.muted}>
                  {v.cover.fromName} can cover {formatPeso(v.cover.coverMinor)}. {formatPeso(v.cover.stillNeededMinor)} would still be needed.
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.muted}>{v.cover.fromName} has nothing left to cover with.</p>
          )}
          {coverError ? (
            <p className={styles.inlineError} role="alert">
              {coverError}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
