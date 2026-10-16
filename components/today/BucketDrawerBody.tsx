"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Field, Select } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import { moveBetweenBucketsAction, removeStartAction } from "@/lib/actions/starting";
import { cn } from "@/lib/cn";
import type { DrawerLine, DrawerView } from "@/lib/data/today-model";
import { formatPeso, parseMoney } from "@/lib/money";
import styles from "./today.module.css";

const signed = (minor: number) => (minor > 0 ? `+${formatPeso(minor)}` : formatPeso(minor));

/** "Also move ₱X from MariBank to GCash in your apps" when two buckets are kept in different accounts. */
export function moveReminder(fromAccount: string | null, toAccount: string | null, amountMinor: number): string | null {
  if (!fromAccount || !toAccount || fromAccount === toAccount || amountMinor <= 0) return null;
  return `Also move ${formatPeso(amountMinor)} from ${fromAccount} to ${toAccount} in your apps. Accounts will show the difference until the balances match.`;
}

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
              <li key={i} className={cn(l.amountMinor > 0 && styles.dIn, l.startId && styles.dStart)}>
                <span>{l.label}</span>
                <span className={styles.dots} aria-hidden="true" />
                <span>{signed(l.amountMinor)}</span>
                {l.startId ? (
                  <span className={styles.dStartAct}>
                    <RemoveStart line={l} view={v} />
                  </span>
                ) : null}
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
      <MovePanel key={v.bucketId} view={v} />
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

/** Removing a starting-money line is a soft delete; if some was spent the bucket then shows "Needs", so say so first. */
function RemoveStart({ line, view }: { line: DrawerLine; view: DrawerView }) {
  const announce = useAnnounce();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const after = view.leftMinor - line.amountMinor;
  if (!asking) {
    return (
      <Button variant="quiet" className={styles.dRemove} aria-label={`Remove ${line.label}`} onClick={() => setAsking(true)} data-testid="start-remove">
        Remove
      </Button>
    );
  }
  return (
    <span className={styles.dConfirm} role="group" aria-label="Confirm removing this money">
      <span className={styles.dConfirmText}>
        This takes {formatPeso(line.amountMinor)} out of {view.name}.{after < 0 ? ` Some was spent, so it will show Needs ${formatPeso(-after)}.` : ""}
      </span>
      <Button
        variant="warm"
        loading={busy}
        loadingLabel="Removing"
        data-testid="start-remove-confirm"
        onClick={async () => {
          setBusy(true);
          setError(null);
          let r: Awaited<ReturnType<typeof removeStartAction>>;
          try {
            r = await removeStartAction({ id: line.startId as string });
          } catch {
            r = { ok: false, error: "Couldn't remove it. Check your connection and try again." };
          }
          setBusy(false);
          if (!r.ok) return setError(r.error);
          announce(`Removed ${formatPeso(line.amountMinor)} from ${view.name}.`);
        }}
      >
        Remove
      </Button>
      <Button variant="quiet" onClick={() => setAsking(false)}>
        Keep it
      </Button>
      {error ? (
        <span className={styles.inlineError} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** "Move to another bucket": a cover (note 'move'), capped at what is left. Never moves money between accounts by itself. */
function MovePanel({ view: v }: { view: DrawerView }) {
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const to = v.moveTargets.find((t) => t.bucketId === target) ?? null;
  const parsed = raw.trim() === "" ? null : parseMoney(raw);
  const amount = parsed && parsed.ok ? parsed.minor : 0;
  const reminder = to ? moveReminder(v.keptIn, to.keptIn, amount) : null;

  if (!open) {
    return (
      <div className={styles.dMove}>
        {v.moveMaxMinor > 0 && v.moveTargets.length > 0 ? (
          <Button
            variant="soft"
            onClick={() => {
              setDone(null);
              setOpen(true);
            }}
            data-testid="drawer-move"
          >
            Move to another bucket
          </Button>
        ) : (
          <p className={styles.muted}>{v.moveTargets.length === 0 ? "There is no other bucket to move money to." : "Nothing left to move."}</p>
        )}
        {done ? (
          <p className={styles.muted} role="status" data-testid="move-done">
            {done}
          </p>
        ) : null}
        <p className={styles.muted}>
          This changes money you have now. To change how future paydays are split, use <Link href="/plans/split">Split plan</Link>.
        </p>
      </div>
    );
  }

  async function submit() {
    if (!to) return setError("Choose which bucket to move it to.");
    if (!parsed || !parsed.ok || amount <= 0) return setError("Enter an amount like 1,200.");
    if (amount > v.moveMaxMinor) return setError(`${v.name} has ${formatPeso(v.moveMaxMinor)} left. Enter that or less.`);
    setBusy(true);
    setError(null);
    let r: Awaited<ReturnType<typeof moveBetweenBucketsAction>>;
    try {
      r = await moveBetweenBucketsAction({ fromBucketId: v.bucketId, toBucketId: to.bucketId, amountMinor: amount });
    } catch {
      r = { ok: false, error: "Couldn't move it. Check your connection and try again." };
    }
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const msg = `Moved ${formatPeso(amount)} from ${v.name} to ${to.name}.${reminder ? ` ${reminder}` : ""}`;
    announce(msg);
    setDone(msg);
    setRaw("");
    setTarget("");
    setOpen(false);
  }

  return (
    <form
      className={styles.dMoveForm}
      noValidate
      aria-label={`Move money out of ${v.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Move to">
        {(c) => (
          <Select {...c} value={target} onChange={(e) => (setTarget(e.target.value), setError(null))} data-testid="move-target">
            <option value="">Choose a bucket</option>
            {v.moveTargets.map((t) => (
              <option key={t.bucketId} value={t.bucketId}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <MoneyInput
        label="Amount"
        hint={`Up to ${formatPeso(v.moveMaxMinor)}, what is left in ${v.name}.`}
        value={raw}
        onValueChange={(x) => (setRaw(x), setError(null))}
      />
      {reminder ? (
        <p className={styles.dReminder} data-testid="move-reminder">
          {reminder}
        </p>
      ) : null}
      {error ? (
        <p className={styles.inlineError} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.dMoveBtns}>
        <Button type="submit" variant="primary" loading={busy} loadingLabel="Moving" data-testid="move-submit">
          Move
        </Button>
        <Button variant="quiet" onClick={() => (setOpen(false), setError(null))}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
