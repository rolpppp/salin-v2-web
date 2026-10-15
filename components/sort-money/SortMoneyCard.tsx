"use client";

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import { sortMoneyAction } from "@/lib/actions/sort-money";
import { formatPeso, parseMoney } from "@/lib/money";
import { sortKey, sortLines, type SortGroup } from "@/lib/money/sort";
import styles from "./sort-money.module.css";

const LATER_KEY = "salin.sort.later";
const subscribeNever = () => () => {};
const readLater = () => {
  try {
    return localStorage.getItem(LATER_KEY);
  } catch {
    return null;
  }
};
/** "Not now" hides this exact set of amounts; new unsorted money brings the card back. */
const signature = (groups: readonly SortGroup[]) => groups.map((g) => `${g.fromBucketId}|${g.accountId}|${g.amountMinor}`).join(",");

const toInput = (minor: number) => {
  if (minor <= 0) return "";
  const pesos = Math.floor(minor / 100);
  const cents = minor - pesos * 100;
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents === 0 ? grouped : `${grouped}.${String(cents).padStart(2, "0")}`;
};
const hue = (h: string | null) => ({ "--c": h && /^[a-z][a-z0-9]{1,19}$/.test(h) ? `var(--b-${h}, var(--ink-3))` : "var(--ink-3)" }) as CSSProperties;

/**
 * "Sort the money you already have" (ticket 34). Shown on Today when money from before the plan still counts as one
 * bucket but already sits in the accounts other buckets use. Pre-filled from where it is; one tap writes it all.
 */
export function SortMoneyCard({ groups }: { groups: SortGroup[] }) {
  const announce = useAnnounce();
  const sig = signature(groups);
  const later = useSyncExternalStore(subscribeNever, () => readLater() === sig, () => true);
  const [hidden, setHidden] = useState(false);
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.targets.map((t) => [sortKey(g, t.bucketId), toInput(t.suggestedMinor)]))),
  );
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
    return { amounts, bad, ...sortLines(groups, amounts) };
  }, [raw, groups]);

  if (groups.length === 0 || later || hidden) return null;
  const fromNames = [...new Set(groups.map((g) => g.fromName))];
  const total = groups.reduce((t, g) => t + g.amountMinor, 0);

  async function submit() {
    if (parsed.bad.size > 0) return setError("Fix the amounts marked above.");
    if (parsed.over) return setError(`That's more than the ${formatPeso(parsed.over.amountMinor)} in ${parsed.over.accountName}.`);
    if (parsed.lines.length === 0) return setError("Enter at least one amount, or choose Not now.");
    setBusy(true);
    setError(null);
    let r: Awaited<ReturnType<typeof sortMoneyAction>>;
    try {
      r = await sortMoneyAction(parsed.lines);
    } catch {
      r = { ok: false, error: "Couldn't save. Check your connection and try again." };
    }
    setBusy(false);
    if (!r.ok) return setError(r.error);
    announce(`Sorted ${formatPeso(parsed.totalMinor)} into your buckets.`);
    setHidden(true);
  }

  return (
    <Card as="section" className={styles.card} aria-labelledby="sort-h" data-testid="sort-money">
      <p className={styles.kicker}>
        <i aria-hidden="true" />
        Your plan is set
      </p>
      <h2 id="sort-h" className={styles.title}>
        Sort the money you already have
      </h2>
      <p className={styles.lede}>
        {formatPeso(total)} came in before your plan, so it still counts as {fromNames.join(" and ")}. It&apos;s already in the accounts your new buckets use. Choose
        which bucket it belongs to. Nothing moves between accounts.
      </p>

      <div className={styles.groups}>
        {groups.map((g) => {
          const used = g.targets.reduce((t, x) => t + (parsed.amounts.get(sortKey(g, x.bucketId)) ?? 0), 0);
          const stays = g.amountMinor - used;
          return (
            <section key={`${g.fromBucketId}|${g.accountId}`} className={styles.group} aria-labelledby={`sort-${g.accountId}`} data-testid={`sort-group-${g.accountName}`}>
              <h3 id={`sort-${g.accountId}`} className={styles.gHead}>
                <span>In {g.accountName}</span>
                <b>{formatPeso(g.amountMinor)}</b>
              </h3>
              <div className={styles.rows}>
                {g.targets.map((t) => {
                  const k = sortKey(g, t.bucketId);
                  return (
                    <MoneyInput
                      key={k}
                      className={styles.field}
                      label={
                        <span className={styles.label} style={hue(t.hue)}>
                          <i aria-hidden="true" />
                          {t.name}
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
              <p className={styles.stays} data-over={stays < 0 || undefined} data-testid="sort-stays">
                {stays < 0 ? `${formatPeso(-stays)} more than is in ${g.accountName}` : `${formatPeso(stays)} stays in ${g.fromName}`}
              </p>
            </section>
          );
        })}
      </div>

      <div className={styles.foot}>
        <Button variant="primary" loading={busy} loadingLabel="Sorting" onClick={() => void submit()} data-testid="sort-submit">
          Sort it
        </Button>
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
        <p role="alert" className={styles.err}>
          {error}
        </p>
      </div>
    </Card>
  );
}
