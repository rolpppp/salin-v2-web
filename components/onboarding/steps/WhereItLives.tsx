"use client";

import { Select } from "@/components/field/Field";
import { formatPeso, formatPesoWhole } from "@/lib/money/format";
import { HOMES_QUESTION, HOMES_REASON, computeHomes, homeBuckets, homesOnEnter, paydayPreview, phpAccounts, setHome } from "@/lib/onboarding/homes-step";
import { bucketName } from "@/lib/onboarding/plan-step";
import type { StepBodyProps, StepModule } from "@/lib/onboarding/step";
import styles from "./steps.module.css";

function WhereItLivesBody({ draft, ctx, update }: StepBodyProps) {
  const accounts = phpAccounts(draft);
  const homes = computeHomes(draft);
  const buckets = homeBuckets(draft);
  const preview = paydayPreview(draft, ctx);
  const landingId = preview.landing?.id ?? null;

  if (accounts.length === 0) return <p className={styles.note}>Add at least one Philippine peso account first, then come back here.</p>;

  return (
    <div className={styles.stack}>
      {draft.skipped ? <p className={styles.note}>You&apos;re just tracking for now, so everything stays in the account your pay lands in.</p> : null}
      <div className={styles.homes}>
        {buckets.map((k) => {
          const id = `home-${k}`;
          const name = bucketName(draft, k);
          return (
            <div key={k} className={styles.home} style={{ ["--c" as string]: k === "scholarship" ? "var(--b-dost)" : `var(--b-${k})` }}>
              <span className={styles.bn}>
                <i aria-hidden="true" />
                {name}
              </span>
              <label className="sr" htmlFor={id}>
                {name} lives in
              </label>
              <Select id={id} value={homes[k] ?? landingId ?? ""} disabled={draft.skipped} onChange={(e) => update(setHome(draft, k, e.target.value))}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.id === landingId ? " (pay lands here)" : ""}
                  </option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>

      <div className={styles.preview}>
        <h3 className={styles.sub}>What payday will look like</h3>
        {preview.amountMinor > 0 && preview.landing ? (
          <p className={styles.muted}>
            For a {formatPesoWhole(preview.amountMinor)} pay landing in {preview.landing.name}:
          </p>
        ) : null}
        <ul className={styles.moves}>
          {preview.keepMinor > 0 && preview.landing ? (
            <li className={styles.move} data-keep>
              <span className={styles.arrow} aria-hidden="true">
                ↓
              </span>
              <span>
                <b>
                  Keep {formatPeso(preview.keepMinor)} in {preview.landing.name}
                </b>
                <small>{preview.keepNames.join(", ")} · already there</small>
              </span>
              <span className={styles.v}>{formatPeso(preview.keepMinor)}</span>
            </li>
          ) : null}
          {preview.sends.map((s) => (
            <li key={s.toId} className={styles.move}>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
              <span>
                <b>
                  Send {formatPeso(s.amountMinor)} to {s.toName}
                </b>
                <small>{s.names.join(", ")}</small>
              </span>
              <span className={styles.v}>{formatPeso(s.amountMinor)}</span>
            </li>
          ))}
        </ul>
        <p className={styles.muted} role="status" aria-live="polite">
          {preview.text}
        </p>
      </div>
    </div>
  );
}

export const homesStep: StepModule = {
  id: "homes",
  label: "Where it lives",
  question: () => HOMES_QUESTION,
  reason: () => HOMES_REASON,
  Body: WhereItLivesBody,
  validate: () => null,
  onEnter: (draft) => homesOnEnter(draft),
};
