"use client";

import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepBodyProps } from "@/lib/onboarding/step";
import { RHYTHM_FIELDS, RHYTHM_OPTIONS, rhythmOnEnter, setRhythm, sourceNameOf, validateRhythm } from "@/lib/onboarding/simple-path";
import { WEB_FIELDS, setFirstName } from "@/lib/onboarding/web-path";
import { StepPesoField, StepTextField } from "./fields";
import fieldStyles from "./steps.module.css";
import styles from "./simple-steps.module.css";

/** Onboarding v2, step "Your rhythm" (allowance, stipend or mix). Sets the "make it last until" date Simple view uses. */
function RhythmBody({ draft, ctx, update, errorField }: StepBodyProps) {
  const r = draft.rhythm;
  const unsure = r.nextDate === null;
  return (
    <div className={fieldStyles.stack}>
      <StepTextField id={WEB_FIELDS.name} label="What should we call you?" placeholder="First name" maxLength={40} value={draft.firstName ?? ""} invalid={errorField === WEB_FIELDS.name} onValueChange={(v) => update(setFirstName(v))} />
      <StepPesoField
        id={RHYTHM_FIELDS.amount}
        label="About how much do you usually get?"
        hint="Each time it comes. A rough number is fine; you can change it later."
        minor={r.amountMinor}
        invalid={errorField === RHYTHM_FIELDS.amount}
        onMinor={(m) => update(setRhythm(draft, { amountMinor: m }))}
      />

      <fieldset className={fieldStyles.fs}>
        <legend>How often?</legend>
        <div className={fieldStyles.chips}>
          {RHYTHM_OPTIONS.map((o, i) => (
            <label key={o.value} className={fieldStyles.chipOpt}>
              <input
                type="radio"
                name="ob-rhythm"
                id={`ob-rhythm-freq-${o.value}`}
                value={o.value}
                checked={r.frequency === o.value}
                aria-invalid={errorField === RHYTHM_FIELDS.frequency && i === 0 ? true : undefined}
                onChange={() => update(setRhythm(draft, { frequency: o.value }))}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={fieldStyles.fld}>
        <label htmlFor={RHYTHM_FIELDS.next} className={fieldStyles.fldLabel}>
          When is the next one?
        </label>
        <input
          id={RHYTHM_FIELDS.next}
          type="date"
          className={fieldStyles.text}
          min={ctx.todayIso}
          value={r.nextDate ?? ""}
          aria-invalid={errorField === RHYTHM_FIELDS.next ? true : undefined}
          onChange={(e) => update(setRhythm(draft, { nextDate: e.target.value || null }))}
        />
        <label className={styles.unsure}>
          <input type="checkbox" id={RHYTHM_FIELDS.unsure} checked={unsure} onChange={(e) => {
            if (e.target.checked) update(setRhythm(draft, { nextDate: null }));
            else document.getElementById(RHYTHM_FIELDS.next)?.focus();
          }} />
          <span>Not sure yet</span>
        </label>
        <p className={fieldStyles.fldNote}>{r.nextDate ? "Your spending money will be paced to last until then." : "No date is fine. We'll pace it by the week until you know."}</p>
      </div>
    </div>
  );
}

export const rhythmStep: ShellStepModule = {
  id: "rhythm",
  label: "Your rhythm",
  question: (d) => (d.rhythm.frequency === "quarterly" || d.rhythm.frequency === "semester" ? "How long does this need to last?" : `When does your ${sourceNameOf(d.pattern).toLowerCase()} come?`),
  reason: () => "This sets the day your money has to last until, so Salin can tell you what's fine to spend today.",
  Body: RhythmBody,
  validate: validateRhythm,
  onEnter: rhythmOnEnter,
};
