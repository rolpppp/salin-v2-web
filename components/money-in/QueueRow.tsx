"use client";

import type { CSSProperties } from "react";
import { Button } from "@/components/button/Button";
import { Chip } from "@/components/chip/Chip";
import { Field, Select } from "@/components/field/Field";
import {
  hueVar,
  jobText,
  kindChipText,
  ruleCardText,
  shortDate,
  whyText,
  type Choice,
  type JobPick,
  type MiIncome,
  type MiSource,
  type MoneyInData,
  type Preview,
  type SourceKind,
} from "@/lib/data/money-in-model";
import { formatAud, formatPeso, ratePerAud } from "@/lib/money";
import styles from "./money-in.module.css";

const KIND_COLOR: Record<SourceKind, string> = {
  salary: "var(--accent)",
  scholarship: "var(--b-dost)",
  side_hustle: "var(--b-sinking)",
  allowance: "var(--b-living)",
  gift: "var(--b-fun)",
  refund: "var(--b-buffer)",
  other: "var(--b-rent)",
};

export type QueueRowProps = {
  data: MoneyInData;
  income: MiIncome;
  source: MiSource | undefined;
  preview: Preview;
  choice: Choice;
  open: boolean;
  /** Show "Confirm just this one" (only when more than one income waits). */
  canConfirmOne: boolean;
  busy: boolean;
  onToggle: () => void;
  onChoice: (c: Choice) => void;
  onConfirmOne: () => void;
};

export function QueueRow({ data, income, source, preview, choice, open, canConfirmOne, busy, onToggle, onChoice, onConfirmOne }: QueueRowProps) {
  const account = data.accounts.find((a) => a.id === income.accountId);
  const chip = source ? kindChipText(source) : null;
  const needs = preview.kind !== "ready";
  const detailId = `money-in-detail-${income.id}`;
  const oneBuckets = data.buckets.filter((b) => !b.isArchived && b.id !== data.plan.rentRedirect?.rentBucketId && b.hue !== "rent");
  const oneValue = choice.oneBucketId ?? data.plan.emergencyBucketId ?? "";
  const aud =
    income.sentMinor && income.sentCurrency === "AUD"
      ? `${formatAud(income.sentMinor)} sent · ${formatPeso(ratePerAud(income.amountMinor, income.sentMinor))} per A$1`
      : null;

  const options: Array<{ value: JobPick; title: string; desc: string; disabled?: boolean }> = [
    { value: "rule", title: "Use its rule", desc: ruleCardText(source, data.buckets), disabled: !source || source.rule === "ask" },
    { value: "plan", title: "Split by my plan", desc: "Your plan's percentages, applied to this amount." },
    { value: "one", title: "One-off: all to one bucket", desc: "Everything goes to the bucket you choose." },
  ];

  return (
    <div className={styles.qitem} data-open={open} data-testid="queue-item" style={{ "--c": source ? KIND_COLOR[source.kind] : "var(--b-rent)" } as CSSProperties}>
      <button type="button" className={styles.qrow} aria-expanded={open} aria-controls={detailId} data-income-row={income.id} onClick={onToggle}>
        <span className={styles.kdot} aria-hidden="true" />
        <span className={styles.qmain}>
          <span className={styles.qname}>
            {source?.name ?? "Unknown source"}
            {chip ? <Chip tone="neutral">{chip}</Chip> : null}
          </span>
          <span className={styles.qsmall}>
            {shortDate(income.dateIso)} · landed in {account?.name ?? "an account"}
            {aud ? ` · ${aud}` : ""}
          </span>
          <span className={`${styles.qsmall} ${needs ? styles.needs : ""}`} data-testid="job-text">
            {jobText(preview, income, source, data.buckets, data.plan)}
          </span>
        </span>
        <span className={styles.qamt} data-amount>
          {formatPeso(income.amountMinor)}
        </span>
      </button>

      {open ? (
        <div className={styles.detail} id={detailId}>
          <fieldset className={styles.choice}>
            <legend className="sr">Job for {source?.name ?? "this income"}</legend>
            {options.map((o) => (
              <label key={o.value} className={styles.opt}>
                <input
                  type="radio"
                  name={`job-${income.id}`}
                  value={o.value}
                  checked={choice.pick === o.value}
                  disabled={o.disabled}
                  onChange={() => onChoice({ pick: o.value, oneBucketId: o.value === "one" ? choice.oneBucketId : null })}
                />
                <span className={styles.optBox}>
                  <b>{o.title}</b>
                  <span>{o.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {choice.pick === "one" ? (
            <div className={styles.oneBucket}>
              <Field label="Bucket">
                {(c) => (
                  <Select {...c} value={oneValue} onChange={(e) => onChoice({ pick: "one", oneBucketId: e.target.value })}>
                    {oneBuckets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          ) : null}

          {preview.kind === "ready" ? (
            <>
              <div className={styles.bars} role="list" aria-label="Where it goes">
                {preview.lines.map((l) => {
                  const b = data.buckets.find((x) => x.id === l.bucketId);
                  const permille = income.amountMinor > 0 ? Math.round((l.amount * 1000) / income.amountMinor) : 0;
                  return (
                    <div key={l.bucketId} className={styles.barRow} role="listitem" style={{ "--c": hueVar(b?.hue) } as CSSProperties}>
                      <span className={styles.barName}>
                        <i aria-hidden="true" />
                        {b?.shortName?.trim() || b?.name || "A bucket"}
                      </span>
                      <span className={styles.track} aria-hidden="true">
                        <i style={{ transform: `scaleX(${permille / 1000})` }} />
                      </span>
                      <span className={styles.barVal} data-amount>
                        {formatPeso(l.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className={styles.why}>{whyText(preview, income, data)}</p>
              {canConfirmOne ? (
                <div>
                  <Button variant="soft" onClick={onConfirmOne} loading={busy} loadingLabel="Confirming">
                    Confirm just this one
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p className={preview.kind === "error" ? styles.problem : styles.helper}>
              {preview.kind === "error" ? preview.message : "Pick a job above to see where it goes."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
