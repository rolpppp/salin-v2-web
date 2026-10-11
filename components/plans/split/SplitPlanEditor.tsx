"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Card } from "@/components/card/Card";
import { Chip } from "@/components/chip/Chip";
import { Input, Select } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { setBucketKeptIn, saveSplitPlan } from "@/lib/actions/plans";
import type { ActionResult } from "@/lib/actions/result";
import { SAVE_FAILED } from "@/lib/actions/result";
import type { SplitPlanData } from "@/lib/data/plans";
import { hueColor } from "../shared";
import { checkPlan, differsFromSaved, draftFromBp, draftToLines, planMessage, type PlanDraft } from "./logic";
import styles from "./split.module.css";

export type SplitActions = {
  savePlan: (planKey: string, lines: Array<{ bucketId: string; percentBp: number }>) => Promise<ActionResult>;
  setKeptIn: (bucketId: string, accountId: string) => Promise<ActionResult>;
};
const defaultActions: SplitActions = { savePlan: saveSplitPlan, setKeptIn: setBucketKeptIn };

type Props = { data: SplitPlanData; actions?: SplitActions; rules?: ReactNode };

export function SplitPlanEditor({ data, actions = defaultActions, rules }: Props) {
  const announce = useAnnounce();
  const planBuckets = data.buckets.filter((b) => !b.planless);
  const planless = data.buckets.filter((b) => b.planless);
  const ids = planBuckets.map((b) => b.id);
  const plans = data.plans;

  const [saved, setSaved] = useState<Record<string, PlanDraft>>(() => Object.fromEntries(plans.map((p) => [p.key, draftFromBp(p.lines, ids)])));
  const [draft, setDraft] = useState<Record<string, PlanDraft>>(saved);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<Record<string, string | null>>({});
  const [kept, setKept] = useState<Record<string, string | null>>(() => Object.fromEntries(data.buckets.map((b) => [b.id, b.keptInAccountId])));
  const [keptError, setKeptError] = useState<Record<string, string | null>>({});

  const checks = Object.fromEntries(plans.map((p) => [p.key, checkPlan(draft[p.key], ids)]));
  const nameOf = (id: string) => data.buckets.find((b) => b.id === id)?.name;

  async function commit(planKey: string) {
    const d = draft[planKey];
    if (!differsFromSaved(d, saved[planKey], ids)) return;
    const check = checks[planKey];
    if (!check.valid) {
      announce(`${planMessage(planKey, check, nameOf(check.invalid[0])) ?? ""} Not saved. Your last saved Plan ${planKey} is still used.`);
      return;
    }
    setSaving((s) => ({ ...s, [planKey]: true }));
    setSaveError((e) => ({ ...e, [planKey]: null }));
    let result: ActionResult;
    try {
      result = await actions.savePlan(planKey, draftToLines(d, ids));
    } catch {
      result = { ok: false, error: SAVE_FAILED };
    }
    setSaving((s) => ({ ...s, [planKey]: false }));
    if (result.ok) {
      setSaved((s) => ({ ...s, [planKey]: d }));
      announce(`Plan ${planKey} saved. It applies to paydays from now on; past paydays stay as they were.`);
    } else {
      // Write failed: restore the last saved numbers and say so at the table.
      setDraft((cur) => ({ ...cur, [planKey]: saved[planKey] }));
      setSaveError((e) => ({ ...e, [planKey]: result.error }));
      announce(result.error);
    }
  }

  async function changeKeptIn(bucketId: string, accountId: string) {
    const previous = kept[bucketId];
    if (accountId === previous) return;
    setKept((k) => ({ ...k, [bucketId]: accountId }));
    setKeptError((e) => ({ ...e, [bucketId]: null }));
    let result: ActionResult;
    try {
      result = await actions.setKeptIn(bucketId, accountId);
    } catch {
      result = { ok: false, error: SAVE_FAILED };
    }
    const bucket = nameOf(bucketId) ?? "This bucket";
    if (result.ok) {
      const acct = data.accounts.find((a) => a.id === accountId)?.name ?? "that account";
      announce(`${bucket} is now kept in ${acct}. It applies to paydays from now on.`);
    } else {
      setKept((k) => ({ ...k, [bucketId]: previous }));
      setKeptError((e) => ({ ...e, [bucketId]: result.error }));
      announce(result.error);
    }
  }

  // A render function, not a component: a component defined here would remount (and drop focus) on every keystroke.
  function renderKept(bucketId: string, label: string, className?: string) {
    const current = kept[bucketId];
    const options = data.accounts.filter((a) => !a.isArchived || a.id === current);
    return (
      <Select aria-label={label} className={className} value={current ?? ""} onChange={(e) => void changeKeptIn(bucketId, e.target.value)}>
        {current === null || !options.some((a) => a.id === current) ? (
          <option value="" disabled>
            Choose an account
          </option>
        ) : null}
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
    );
  }

  const allOk = plans.every((p) => checks[p.key].valid);
  const activeKey = data.activePlan;

  return (
    <div className={styles.stack}>
      <Card aria-labelledby="split-h">
        <div className={styles.head}>
          <h2 id="split-h" className={styles.h2}>
            How each payday is split
          </h2>
          <Chip tone="plan" data-testid="active-plan">
            Plan {activeKey} is active
          </Chip>
        </div>

        <div role="table" aria-labelledby="split-h" className={styles.table} style={{ "--plans": plans.length } as CSSProperties}>
          <div role="row" className={styles.headRow}>
            <span role="columnheader" className={styles.th}>
              Bucket
            </span>
            <span role="columnheader" className={`${styles.th} ${styles.keptHead}`}>
              Kept in
            </span>
            {plans.map((p) => (
              <span key={p.key} role="columnheader" className={`${styles.th} ${styles.right}`}>
                Plan {p.key}
              </span>
            ))}
            <span role="columnheader" className={`${styles.th} ${styles.noteCol}`}>
              What it&rsquo;s for
            </span>
          </div>
          {planBuckets.map((b) => (
            <div role="row" key={b.id} className={styles.row} style={{ "--c": hueColor(b.hue) } as CSSProperties}>
              <span role="rowheader" className={styles.bucket}>
                <i aria-hidden="true" />
                {b.name}
              </span>
              <span role="cell" className={styles.keptCell}>
                {renderKept(b.id, `${b.name} is kept in`, styles.mini)}
                <span className={styles.err} role="alert">
                  {keptError[b.id]}
                </span>
              </span>
              {plans.map((p) => (
                <span key={p.key} role="cell" className={styles.pctCell}>
                  <Input
                    className={styles.pct}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`${b.name} Plan ${p.key} percent`}
                    aria-invalid={checks[p.key].invalid.includes(b.id) ? true : undefined}
                    value={draft[p.key][b.id]}
                    onChange={(e) => setDraft((d) => ({ ...d, [p.key]: { ...d[p.key], [b.id]: e.target.value } }))}
                    onBlur={() => void commit(p.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commit(p.key);
                      }
                    }}
                  />
                </span>
              ))}
              <span role="cell" className={`${styles.note} ${styles.noteCol}`}>
                {b.note}
              </span>
            </div>
          ))}
          <div role="row" className={styles.footRow}>
            <span role="rowheader">Total</span>
            <span role="cell" className={styles.footKept} />
            {plans.map((p) => (
              <span key={p.key} role="cell" className={`${styles.right} ${checks[p.key].total === 100 && checks[p.key].invalid.length === 0 ? styles.ok : styles.bad}`} data-testid={`total-${p.key}`}>
                {checks[p.key].total}%
                {checks[p.key].total !== 100 ? <span className="sr"> needs 100%</span> : null}
              </span>
            ))}
            <span role="cell" className={styles.noteCol} />
          </div>
        </div>

        <div className={styles.msgs} data-testid="plan-messages">
          {plans.map((p) => {
            const c = checks[p.key];
            const msg = planMessage(p.key, c, c.invalid[0] ? nameOf(c.invalid[0]) : undefined);
            const dirty = differsFromSaved(draft[p.key], saved[p.key], ids);
            if (saveError[p.key]) {
              return (
                <p key={p.key} className={styles.msgBad} role="alert">
                  {saveError[p.key]} Plan {p.key} is back to its last saved numbers.
                </p>
              );
            }
            if (msg) {
              return (
                <p key={p.key} className={styles.msgBad}>
                  {msg}
                  {dirty ? ` Not saved yet: your last saved Plan ${p.key} is still used for new paydays.` : ""}
                </p>
              );
            }
            if (saving[p.key]) return <p key={p.key}>Saving Plan {p.key}…</p>;
            return null;
          })}
          {allOk && !Object.values(saving).some(Boolean) ? (
            <p>{plans.length > 1 ? "Both plans add up to 100%." : "Your plan adds up to 100%."} Changes apply from your next payday, never to past ones.</p>
          ) : null}
        </div>

        {planless.map((b) => (
          <p key={b.id} className={styles.planless} style={{ "--c": hueColor(b.hue) } as CSSProperties}>
            <span className={styles.bucket}>
              <i aria-hidden="true" />
              {b.name}
            </span>
            <span>isn&rsquo;t part of the split. It&rsquo;s kept in</span>
            {renderKept(b.id, `${b.name} is kept in`, `${styles.mini} ${styles.planlessSelect}`)}
            <span className={styles.err} role="alert">
              {keptError[b.id]}
            </span>
          </p>
        ))}
      </Card>
      {rules}
    </div>
  );
}
