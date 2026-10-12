"use client";

import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepBodyProps } from "@/lib/onboarding/step";
import {
  EXTRA_KIND_OPTIONS,
  INCOME_QUESTION,
  INCOME_REASON,
  MAIN_KIND_OPTIONS,
  WEB_FIELDS,
  WEB_FREQUENCY_OPTIONS,
  extraKinds,
  setFirstName,
  setIncome,
  toggleExtra,
  validateWebIncome,
  webIncomeOnEnter,
} from "@/lib/onboarding/web-path";
import { StepPesoField, StepTextField } from "./fields";
import styles from "./steps.module.css";

/** SPEC §7.3 step 1 (web path). */
function WebIncomeBody({ draft, ctx, update, errorField }: StepBodyProps) {
  const extras = extraKinds(draft);
  return (
    <div className={styles.stack}>
      <StepTextField
        id={WEB_FIELDS.name}
        label="What should we call you?"
        placeholder="First name"
        maxLength={40}
        value={draft.firstName ?? ""}
        invalid={errorField === WEB_FIELDS.name}
        onValueChange={(v) => update(setFirstName(v))}
      />

      <fieldset className={styles.cards}>
        <legend className="sr">Your main income</legend>
        {MAIN_KIND_OPTIONS.map((o) => (
          <label key={o.value} className={styles.opt}>
            <input type="radio" name="ob-kind" id={`ob-kind-${o.value}`} value={o.value} checked={draft.income.kind === o.value} onChange={() => update(setIncome(draft, { kind: o.value }))} />
            <span className={styles.optBody}>
              <b>{o.title}</b>
              <small>{o.help}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <div className={styles.row2}>
        <StepPesoField
          id={WEB_FIELDS.amount}
          label="About how much each time?"
          hint="What lands in your account, after deductions."
          minor={draft.income.amountMinor}
          invalid={errorField === WEB_FIELDS.amount}
          onMinor={(m) => update(setIncome(draft, { amountMinor: m }))}
        />
        <div className={styles.fld}>
          <label htmlFor={WEB_FIELDS.payday} className={styles.fldLabel}>
            Next one comes on
          </label>
          <input
            id={WEB_FIELDS.payday}
            type="date"
            className={styles.text}
            min={ctx.todayIso}
            value={draft.income.nextPayday ?? ""}
            aria-invalid={errorField === WEB_FIELDS.payday ? true : undefined}
            onChange={(e) => update(setIncome(draft, { nextPayday: e.target.value || null }))}
          />
        </div>
      </div>

      <fieldset className={styles.fs}>
        <legend>How often?</legend>
        <div className={styles.chips}>
          {WEB_FREQUENCY_OPTIONS.map((o) => (
            <label key={o.value} className={styles.chipOpt}>
              <input type="radio" name="ob-freq" id={`ob-freq-${o.value}`} value={o.value} checked={draft.income.frequency === o.value} onChange={() => update(setIncome(draft, { frequency: o.value }))} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={styles.toggle}>
        <input type="checkbox" id="ob-foreign" checked={draft.income.paidInOtherCurrency} onChange={(e) => update(setIncome(draft, { paidInOtherCurrency: e.target.checked }))} />
        <span className={styles.sw} aria-hidden="true" />
        <span>
          <b>I&apos;m paid in another currency</b>
          <small>Like AUD or USD. Enter what lands in pesos; you can log the rate each payday.</small>
        </span>
      </label>

      <fieldset className={styles.fs}>
        <legend>
          Any other money? <em>optional</em>
        </legend>
        <div className={styles.chips}>
          {EXTRA_KIND_OPTIONS.filter((o) => o.value !== draft.income.kind).map((o) => (
            <label key={o.value} className={styles.chipOpt}>
              <input type="checkbox" id={`ob-extra-${o.value}`} checked={extras.includes(o.value)} onChange={() => update(toggleExtra(draft, o.value))} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <p className={styles.fldNote}>Each one gets a sensible rule. A side hustle sets aside 10% for tax; an allowance goes straight to Living.</p>
      </fieldset>
    </div>
  );
}

export const webIncomeStep: ShellStepModule = {
  id: "income",
  label: "Income",
  question: () => INCOME_QUESTION,
  reason: () => INCOME_REASON,
  Body: WebIncomeBody,
  validate: validateWebIncome,
  onEnter: webIncomeOnEnter,
};
