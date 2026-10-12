"use client";

import { useEffect } from "react";
import { shortDate } from "@/lib/data/money-in-model";
import { sourceName } from "@/lib/onboarding/first-pay";
import type { StepBodyProps } from "@/lib/onboarding/step";
import { StepPesoField } from "../steps/fields";
import styles from "./first-pay.module.css";

/** Web path, after "Yes, I'll add it": what came in (prefilled with the usual amount) and when (today or earlier, default today). */
export function EntryForm({ draft, ctx, update, errorField }: StepBodyProps) {
  const f = draft.firstPay;
  const date = f.date ?? "";
  const landing = draft.accounts.find((a) => a.id === draft.landingAccountId)?.name;

  // The date defaults to today once the form is open (the shell's step hooks don't know today).
  useEffect(() => {
    if (f.date === null) update({ firstPay: { ...f, date: ctx.todayIso } });
  }, [f, ctx.todayIso, update]);

  return (
    <>
      <div className={styles.row2}>
        <StepPesoField id="ob-fp-amount" label="Amount received" minor={f.amountMinor} onMinor={(m) => update({ firstPay: { ...f, amountMinor: m } })} invalid={errorField === "ob-fp-amount"} />
        <div className={styles.fld}>
          <label htmlFor="ob-fp-date" className={styles.fldLabel}>
            Date
          </label>
          <input
            id="ob-fp-date"
            type="date"
            className={styles.date}
            max={ctx.todayIso}
            value={date}
            aria-invalid={errorField === "ob-fp-date" ? true : undefined}
            onChange={(e) => update({ firstPay: { ...f, date: e.target.value === "" ? null : e.target.value } })}
          />
        </div>
      </div>
      <p className={styles.note}>
        From {sourceName(draft)}
        {landing ? `, landed in ${landing}` : ""}
        {f.date ? ` on ${shortDate(f.date)}` : ""}. You can change accounts later in Plans.
      </p>
    </>
  );
}
