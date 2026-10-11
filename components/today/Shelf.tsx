import Link from "next/link";
import type { CSSProperties } from "react";
import { Card, CardTitle } from "@/components/card/Card";
import { cn } from "@/lib/cn";
import { hueVar } from "@/lib/data/money-in-model";
import type { ShelfSlot, ShelfView } from "@/lib/data/today-model";
import { formatPeso, formatPesoWhole } from "@/lib/money";
import styles from "./today.module.css";

const css = (v: Record<string, string>) => v as CSSProperties;
const pct = (bp: number) => `calc(var(--shelf-h) * ${bp / 10_000})`;

/**
 * The bucket shelf (SPEC §1): ribbons to one scale, dashed previews of waiting income, coral "Needs" for an
 * overspent bucket. Each slot is a button that opens the drawer. After a confirm the grow animation (ticket 15)
 * starts from `data-left-minor` / `data-pending-minor`; this component only draws the end state.
 */
export function Shelf({ shelf, onOpen }: { shelf: ShelfView | null; onOpen: (bucketId: string, el: HTMLElement) => void }) {
  if (!shelf) {
    return (
      <Card className={styles.shelfCard} aria-labelledby="shelf-h">
        <CardTitle id="shelf-h" className={styles.shelfTitle}>
          Your buckets
        </CardTitle>
        <p className={styles.muted} style={{ marginTop: 8 }}>
          Your buckets show here once you have a plan. <Link href="/plans/split">Set one up in Plans</Link>.
        </p>
      </Card>
    );
  }
  return (
    <Card className={styles.shelfCard} aria-labelledby="shelf-h" data-testid="shelf">
      <div className={styles.shelfTop}>
        <CardTitle id="shelf-h" className={styles.shelfTitle}>
          Your buckets
        </CardTitle>
        <div className={styles.legend}>
          <span>
            <i className={styles.sw} aria-hidden="true" />
            Longer ribbon, more money left
          </span>
          {shelf.preview ? (
            <span data-testid="shelf-legend-preview">
              <i className={cn(styles.sw, styles.swDash)} aria-hidden="true" />
              Where the {formatPeso(shelf.preview.totalMinor)} waiting would go{shelf.preview.note ? ` (${shelf.preview.note})` : ""}
            </span>
          ) : null}
        </div>
      </div>
      <div className={styles.shelfScroll} data-testid="shelf-scroll">
        <div className={styles.shelf} style={css({ "--cols": shelf.groups.map((g) => `${Math.max(2, g.slots.length)}fr`).join(" ") })}>
          {shelf.groups.map((g) => (
            <div key={g.key} className={styles.group} data-group={g.key}>
              <div className={styles.gLabel}>
                {g.title} <small>{g.hint}</small>
              </div>
              <div className={styles.gCols} style={css({ "--gc": String(Math.max(2, g.slots.length)) })}>
                {g.slots.map((s) => (
                  <Slot key={s.id} slot={s} onOpen={onOpen} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.shelfFoot}>
        <span>Click a bucket to see what went in and out. Ribbons are to scale: full height is {formatPesoWhole(shelf.scaleMinor)}.</span>
        <span>
          <b data-testid="shelf-total">{formatPeso(shelf.totalMinor)}</b> in all buckets
        </span>
      </div>
    </Card>
  );
}

function Slot({ slot: s, onOpen }: { slot: ShelfSlot; onOpen: (id: string, el: HTMLElement) => void }) {
  const tagClass = s.tag?.kind === "needs" ? styles.tagWarm : styles.tagGhost;
  const pending =
    s.pendingBp > 0 ? (
      <>
        <span className={cn(styles.pending, s.leftMinor <= 0 && styles.pendingAlone)} style={{ height: pct(s.pendingBp) }} data-testid="pending">
          {s.pendingLabelInside ? <span>+{formatPeso(s.pendingAddMinor).slice(1)}</span> : null}
        </span>
        {s.pendingLabelInside ? null : <span className={styles.pendingLbl}>+{formatPeso(s.pendingAddMinor).slice(1)}</span>}
      </>
    ) : null;
  const tag = s.tag ? <span className={cn(styles.tag, tagClass)}>{s.tag.text}</span> : null;
  return (
    <button
      type="button"
      className={styles.slot}
      style={css({ "--c": hueVar(s.hue) })}
      aria-label={s.ariaLabel}
      onClick={(e) => onOpen(s.id, e.currentTarget)}
      data-testid={`slot-${s.hue ?? s.id}`}
      data-bucket-id={s.id}
      data-left-minor={s.leftMinor}
      data-pending-minor={s.pendingAddMinor}
    >
      <span className={styles.sHead}>
        <span className={styles.sName}>
          <i aria-hidden="true" />
          <span>{s.shortName}</span>
        </span>
        <span className={cn(styles.sAmt, s.leftMinor === 0 && styles.sAmtZero)} data-testid="slot-amount">
          {formatPeso(s.leftMinor)}
        </span>
        <span className={styles.sAcct}>{s.keptIn ?? ""}</span>
      </span>
      <span className={styles.rail} aria-hidden="true" />
      <span className={styles.hang} aria-hidden="true">
        {s.ribbonBp > 0 ? <span className={cn(styles.ribbon, s.tiny && styles.ribbonTiny)} style={{ height: pct(s.ribbonBp) }} data-testid="ribbon" /> : null}
        {tag}
        {pending}
      </span>
    </button>
  );
}
