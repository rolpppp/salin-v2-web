"use client";

import { useEffect, useRef, useState } from "react";
import { addDays } from "@/lib/money/core";
import type { StepBodyProps, StepModule } from "@/lib/onboarding/step";
import {
  BILL_KIND_OPTIONS,
  PRIORITIES_QUESTION,
  PRIORITIES_REASON,
  PRIORITY_OPTIONS,
  PRIO_FIELDS,
  pickPriorityPatch,
  prioritiesOnEnter,
  setBillsLaterPatch,
  setBillsPatch,
  skipPatch,
  toggleBillKind,
  validatePriorities,
} from "@/lib/onboarding/priorities";
import { Button } from "@/components/button/Button";
import { StepPesoField, StepTextField } from "./fields";
import styles from "./steps.module.css";

function PrioritiesBody({ draft, ctx, update, errorField }: StepBodyProps) {
  const skipRef = useRef<HTMLButtonElement | null>(null);
  const pendingSkip = useRef(false);
  const [goalName, setGoalName] = useState(draft.goal?.name ?? "");
  const [costMinor, setCostMinor] = useState(draft.goal?.costMinor ?? 0);

  // `update` is applied by the shell on its next render; submit only once the draft says `skipped`, so Continue validates it.
  useEffect(() => {
    if (pendingSkip.current && draft.skipped) {
      pendingSkip.current = false;
      skipRef.current?.form?.requestSubmit();
    }
  }, [draft.skipped]);

  const commitGoal = (name: string, cost: number) => update({ goal: name.trim() ? { name: name.trim().slice(0, 60), costMinor: cost } : null });
  const hasBills = draft.billsMinor > 0;
  const later = draft.billsStart !== null;

  return (
    <div className={styles.stack}>
      <fieldset className={styles.cards}>
        <legend className="sr">What should your money do first?</legend>
        {PRIORITY_OPTIONS.map((o, i) => (
          <label key={o.value} className={styles.opt}>
            <input
              type="radio"
              name="prio"
              id={`prio-${o.value}`}
              value={o.value}
              checked={draft.priority === o.value}
              aria-invalid={errorField === PRIO_FIELDS.priority && i === 0 ? true : undefined}
              onChange={() => update(pickPriorityPatch(draft, o.value))}
            />
            <span className={styles.optBody}>
              <b>{o.title}</b>
              <small>{o.help}</small>
            </span>
          </label>
        ))}
      </fieldset>

      {draft.priority === "goal" ? (
        <div className={styles.row2}>
          <StepTextField
            id={PRIO_FIELDS.goalName}
            label="What are you saving for?"
            placeholder="e.g. New laptop"
            maxLength={40}
            value={goalName}
            invalid={errorField === PRIO_FIELDS.goalName}
            onValueChange={(v) => {
              setGoalName(v);
              commitGoal(v, costMinor);
            }}
          />
          <StepPesoField
            id={PRIO_FIELDS.goalCost}
            label="How much does it cost?"
            minor={costMinor}
            invalid={errorField === PRIO_FIELDS.goalCost}
            onMinor={(m) => {
              setCostMinor(m ?? 0);
              commitGoal(goalName, m ?? 0);
            }}
          />
        </div>
      ) : null}

      <fieldset className={styles.fs}>
        <legend>
          Fixed bills each month <em>optional</em>
        </legend>
        <div className={styles.row2}>
          <StepPesoField
            id={PRIO_FIELDS.bills}
            label="Fixed bills each month"
            hideLabel
            minor={draft.billsMinor}
            invalid={errorField === PRIO_FIELDS.bills}
            hint={ctx.path === "app" ? "From your recurring bills on the phone." : "Rent, tuition, utilities. Set aside first, so they never surprise you."}
            onMinor={(m) => update(setBillsPatch(draft, m ?? 0))}
          />
          <div className={styles.chips} role="group" aria-label="What the bills are">
            {BILL_KIND_OPTIONS.map((k) => (
              <label key={k.value} className={styles.chipOpt}>
                <input type="checkbox" checked={draft.billKinds.includes(k.value)} onChange={() => update(toggleBillKind(draft, k.value))} />
                <span>{k.label}</span>
              </label>
            ))}
          </div>
        </div>
        {hasBills ? (
          <>
            <label className={styles.toggle}>
              <input type="checkbox" id="prio-later" checked={later} onChange={(e) => update(setBillsLaterPatch(ctx, e.target.checked))} />
              <span className={styles.sw} aria-hidden="true" />
              <span>
                <b>These start later</b>
                <small>Until then, their share goes to your Emergency fund.</small>
              </span>
            </label>
            {later ? (
              <div className={`${styles.fld} ${styles.start}`}>
                <label htmlFor={PRIO_FIELDS.billsStart} className={styles.fldLabel}>
                  Bills start on
                </label>
                <input
                  id={PRIO_FIELDS.billsStart}
                  type="date"
                  className={styles.text}
                  min={addDays(ctx.todayIso, 1)}
                  value={draft.billsStart ?? ""}
                  aria-invalid={errorField === PRIO_FIELDS.billsStart ? true : undefined}
                  onChange={(e) => {
                    if (e.target.value) update({ billsStart: e.target.value });
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </fieldset>

      {draft.skipped ? <p className={styles.note}>Just tracking for now. Pick a priority above if you want a plan instead.</p> : null}
      {!draft.planOnly ? (
        <div className={styles.skipRow}>
          <Button
            variant="quiet"
            type="button"
            onClick={(e) => {
              const form = e.currentTarget.form;
              if (draft.skipped) {
                form?.requestSubmit();
                return;
              }
              skipRef.current = e.currentTarget;
              pendingSkip.current = true;
              update(skipPatch(draft));
            }}
          >
            Skip the plan, just track for now
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export const prioStep: StepModule = {
  id: "prio",
  label: "Priorities",
  question: () => PRIORITIES_QUESTION,
  reason: () => PRIORITIES_REASON,
  Body: PrioritiesBody,
  validate: validatePriorities,
  onEnter: prioritiesOnEnter,
  primaryLabel: () => "See my plan",
};
