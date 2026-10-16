"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Select } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import sort from "@/components/sort-money/sort-money.module.css";
import { startBucketsAction, undoStartAction } from "@/lib/actions/starting";
import { startKey, startLines, type StartGroup } from "@/lib/data/starting-model";
import { formatPeso, parseMoney } from "@/lib/money";
import styles from "./starting-money.module.css";

const LATER_KEY = "salin.start.later";
const subscribeNever = () => () => {};
const readLater = () => {
  try {
    return localStorage.getItem(LATER_KEY);
  } catch {
    return null;
  }
};
/** "Not now" hides this exact set of amounts; new unsorted money brings the card back. */
const signature = (groups: readonly StartGroup[]) => groups.map((g) => `${g.accountId}|${g.unbucketedMinor}`).join(",");

const toInput = (minor: number) => {
  if (minor <= 0) return "";
  const pesos = Math.floor(minor / 100);
  const cents = minor - pesos * 100;
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents === 0 ? grouped : `${grouped}.${String(cents).padStart(2, "0")}`;
};
const hue = (h: string | null) => ({ "--c": h && /^[a-z][a-z0-9]{1,19}$/.test(h) ? `var(--b-${h}, var(--ink-3))` : "var(--ink-3)" }) as CSSProperties;

/**
 * "Sort the money you already have" (ticket 38). Money already in the accounts that no bucket counts yet, pre-filled by
 * the plan (an account that keeps no bucket goes to Spending). Every amount is editable; nothing moves until Save, and
 * Undo is right there after. Stays mounted after Save so the Undo outlives the page refresh.
 */
export function StartingMoneyCard({ groups, dismissible = false }: { groups: StartGroup[]; dismissible?: boolean }) {
  const announce = useAnnounce();
  const [done, setDone] = useState<{ batchId: string; totalMinor: number } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  if (done) {
    return (
      <Card as="section" aria-label="Starting money sorted" data-testid="start-done">
        <div className={styles.done} ref={doneRef} tabIndex={-1}>
          <p>Sorted {formatPeso(done.totalMinor)} into your buckets.</p>
          <Button
            variant="quiet"
            loading={undoing}
            loadingLabel="Undoing"
            data-testid="start-undo"
            onClick={async () => {
              setUndoing(true);
              setUndoError(null);
              let r: Awaited<ReturnType<typeof undoStartAction>>;
              try {
                r = await undoStartAction({ batchId: done.batchId });
              } catch {
                r = { ok: false, error: "Couldn't undo. Check your connection and try again." };
              }
              setUndoing(false);
              if (!r.ok) return setUndoError(r.error);
              announce("Undone. That money isn't in a bucket again.");
              setDone(null);
            }}
          >
            Undo
          </Button>
          <p role="alert" className={styles.err}>
            {undoError}
          </p>
        </div>
      </Card>
    );
  }
  if (groups.length === 0) return null;
  return <StartingForm key={signature(groups)} groups={groups} dismissible={dismissible} onSaved={setDone} />;
}

function StartingForm({ groups, dismissible, onSaved }: { groups: StartGroup[]; dismissible: boolean; onSaved: (d: { batchId: string; totalMinor: number }) => void }) {
  const announce = useAnnounce();
  const sig = signature(groups);
  const later = useSyncExternalStore(subscribeNever, () => (dismissible ? readLater() === sig : false), () => dismissible);
  const [hidden, setHidden] = useState(false);
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.rows.map((r) => [startKey(g.accountId, r.bucketId), toInput(r.suggestedMinor)]))),
  );
  const [extra, setExtra] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const amounts = new Map<string, number>();
    const bad = new Set<string>();
    for (const [k, v] of Object.entries(raw)) {
      if (v.trim() === "") continue;
      const r = parseMoney(v);
      if (r.ok) amounts.set(k, r.minor);
      else bad.add(k);
    }
    return { amounts, bad, ...startLines(groups, amounts, new Map(Object.entries(extra))) };
  }, [raw, extra, groups]);

  if (later || hidden) return null;
  const total = groups.reduce((t, g) => t + g.unbucketedMinor, 0);

  async function submit() {
    if (parsed.bad.size > 0) return setError("Fix the amounts marked above.");
    if (parsed.over) return setError(`That's more than the ${formatPeso(parsed.over.unbucketedMinor)} in ${parsed.over.accountName} that isn't in a bucket yet.`);
    if (parsed.lines.length === 0) return setError("Enter at least one amount, or choose Not now.");
    setBusy(true);
    setError(null);
    let r: Awaited<ReturnType<typeof startBucketsAction>>;
    try {
      r = await startBucketsAction(parsed.lines);
    } catch {
      r = { ok: false, error: "Couldn't save. Check your connection and try again." };
    }
    setBusy(false);
    if (!r.ok) return setError(r.error);
    announce(`Sorted ${formatPeso(r.totalMinor)} into your buckets.`);
    onSaved({ batchId: r.batchId, totalMinor: r.totalMinor });
  }

  return (
    <Card as="section" className={sort.card} aria-labelledby="start-h" data-testid="start-money">
      <p className={sort.kicker}>
        <i aria-hidden="true" />
        Your buckets don&apos;t know about this yet
      </p>
      <h2 id="start-h" className={sort.title}>
        Sort the money you already have
      </h2>
      <p className={sort.lede}>
        {formatPeso(total)} sits in your accounts but isn&apos;t in any bucket, so buckets like Emergency can show ₱0 while the money is really there. We&apos;ve filled in
        where it could go, by your plan. Change any amount, then save. Nothing moves between accounts and none of this counts as income.
      </p>

      <div className={sort.groups}>
        {groups.map((g) => {
          const ids = [...g.rows.map((r) => r.bucketId), ...(extra[g.accountId] ?? [])];
          const used = ids.map((id) => parsed.amounts.get(startKey(g.accountId, id)) ?? 0);
          const left = g.unbucketedMinor - used.reduce((t, x) => t + x, 0);
          const nameOf = (id: string) => g.rows.find((r) => r.bucketId === id) ?? g.picks.find((p) => p.bucketId === id);
          const addable = g.picks.filter((p) => !(extra[g.accountId] ?? []).includes(p.bucketId));
          return (
            <section key={g.accountId} className={sort.group} aria-labelledby={`start-${g.accountId}`} data-testid={`start-group-${g.accountName}`}>
              <h3 id={`start-${g.accountId}`} className={sort.gHead}>
                <span>{g.accountName}</span>
                <b>{formatPeso(g.unbucketedMinor)} to sort</b>
              </h3>
              <div className={sort.rows}>
                {ids.map((id) => {
                  const k = startKey(g.accountId, id);
                  const b = nameOf(id);
                  return (
                    <MoneyInput
                      key={k}
                      className={sort.field}
                      label={
                        <span className={sort.label} style={hue(b?.hue ?? null)}>
                          <i aria-hidden="true" />
                          {b?.name ?? "Bucket"}
                        </span>
                      }
                      value={raw[k] ?? ""}
                      onValueChange={(v) => {
                        setRaw((p) => ({ ...p, [k]: v }));
                        setError(null);
                      }}
                      error={parsed.bad.has(k) ? "Enter an amount like 1,200." : undefined}
                    />
                  );
                })}
              </div>
              {addable.length > 0 ? (
                <div className={styles.pick}>
                  <Select
                    aria-label={`Add a bucket for ${g.accountName}`}
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) setExtra((p) => ({ ...p, [g.accountId]: [...(p[g.accountId] ?? []), id] }));
                    }}
                  >
                    <option value="">Add another bucket</option>
                    {addable.map((p) => (
                      <option key={p.bucketId} value={p.bucketId}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <p className={sort.stays} data-over={left < 0 || undefined} data-testid="start-left">
                {left < 0 ? `${formatPeso(-left)} more than is in ${g.accountName}` : `${formatPeso(left)} left to sort`}
              </p>
            </section>
          );
        })}
      </div>

      <div className={sort.foot}>
        <Button variant="primary" loading={busy} loadingLabel="Saving" onClick={() => void submit()} data-testid="start-submit">
          Save
        </Button>
        {dismissible ? (
          <Button
            variant="quiet"
            onClick={() => {
              try {
                localStorage.setItem(LATER_KEY, sig);
              } catch {
                // Private mode: it just shows again next time.
              }
              setHidden(true);
            }}
          >
            Not now
          </Button>
        ) : null}
        <p role="alert" className={sort.err}>
          {error}
        </p>
      </div>
    </Card>
  );
}
