"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { cn } from "@/lib/cn";
import { formatPeso, floorDiv } from "@/lib/money";
import { useCountUp } from "@/lib/motion/useCountUp";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepBodyProps } from "@/lib/onboarding/step";
import { MONEY_FIELDS, moneySplit, perDayFor, validateFirstMoney } from "@/lib/onboarding/simple-path";
import { useOnboardingEnv } from "../env";
import { StepPesoField } from "./fields";
import fieldStyles from "./steps.module.css";
import styles from "./simple-steps.module.css";

const MAX_DOTS = 28;

const pesos = (whole: number) => formatPeso(whole * 100).slice(1, -3);

/** Counts from the previous value to this one. Remounted (keyed) on every change, since the hook is a one-shot per mount. */
function Count({ from, to }: { from: number; to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, { active: from !== to, from, to, format: pesos, finalText: pesos(to), durationMs: 500 });
  return <span ref={ref}>{pesos(to)}</span>;
}

/** The number the whole flow leads to: about how much a day. Dots show the days it must cover. */
function PerDay({ perDayMinor, days, untilLabel }: { perDayMinor: number; days: number; untilLabel: string }) {
  const whole = floorDiv(perDayMinor, 100);
  const [shown, setShown] = useState({ now: whole, prev: whole });
  if (shown.now !== whole) setShown({ now: whole, prev: shown.now });
  const dots = Math.min(days, MAX_DOTS);
  return (
    <div className={styles.perDay} data-testid="per-day" data-per-day-minor={perDayMinor} aria-live="polite">
      <p className={styles.perDayLine}>
        About{" "}
        <span className={styles.perDayNum}>
          ₱<Count key={whole} from={shown.prev} to={whole} />
        </span>{" "}
        a day
      </p>
      <p className={styles.perDayFoot}>
        until {untilLabel} · {days} {days === 1 ? "day" : "days"}
      </p>
      <div className={styles.dots} aria-hidden="true">
        {Array.from({ length: dots }, (_, i) => (
          <i key={i} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}

/** Onboarding v2, step "First money": type what you have, spread it across accounts, see the daily number. */
function FirstMoneyBody({ draft, ctx, update, errorField }: StepBodyProps) {
  const fm = draft.firstMoney;
  const split = moneySplit(draft);
  const land = draft.accounts.find((a) => a.id === draft.landingAccountId);
  const others = draft.accounts.filter((a) => a.id !== draft.landingAccountId);
  const pd = perDayFor(draft, ctx.todayIso);
  const set = (patch: Partial<OnboardingDraft["firstMoney"]>) => update({ firstMoney: { ...fm, ...patch } });
  return (
    <div className={fieldStyles.stack}>
      <StepPesoField id={MONEY_FIELDS.amount} label="How much do you have right now?" hint="All of it, across every account. Cash in your wallet counts." minor={fm.amountMinor} invalid={errorField === MONEY_FIELDS.amount} onMinor={(m) => set({ amountMinor: m })} />

      {fm.amountMinor && others.length > 0 ? (
        <fieldset className={cn(fieldStyles.fs, styles.where)}>
          <legend>Where is it?</legend>
          <ul className={styles.rows}>
            {land ? (
              <li className={styles.row}>
                <span>{land.name}</span>
                <b className={styles.remainder}>{split.ok ? formatPeso(split.landingMinor) : "·"}</b>
              </li>
            ) : null}
            {others.map((a) => (
              <li key={a.id} className={styles.row}>
                <StepPesoField
                  id={`ob-money-${a.id}`}
                  label={a.name}
                  minor={fm.extra[a.id] ?? null}
                  onMinor={(m) => {
                    const extra = { ...fm.extra };
                    if (m) extra[a.id] = m;
                    else delete extra[a.id];
                    set({ extra });
                  }}
                />
              </li>
            ))}
          </ul>
          <p className={fieldStyles.fldNote}>{land?.name ?? "Your main account"} holds the rest, so it always adds up.</p>
        </fieldset>
      ) : null}

      {fm.amountMinor ? (
        <StepPesoField id={MONEY_FIELDS.keep} label={<>Keep some aside? <em>optional</em></>} hint="Set it apart in your emergency fund. It isn't counted as spending money." minor={fm.keepMinor || null} invalid={errorField === MONEY_FIELDS.keep} onMinor={(m) => set({ keepMinor: m ?? 0 })} />
      ) : null}

      {pd ? <PerDay perDayMinor={pd.perDayMinor} days={pd.days} untilLabel={pd.untilLabel} /> : null}
      {!pd && split.ok === false && fm.amountMinor ? <p className={fieldStyles.fldNote}>{split.message}</p> : null}
    </div>
  );
}

function SkipExtra({ draft }: StepBodyProps) {
  const { finish, finishing } = useOnboardingEnv();
  return (
    <Button variant="quiet" onClick={() => void finish({ ...draft, firstMoney: { amountMinor: null, extra: {}, keepMinor: 0 } }, "done")} disabled={finishing}>
      Skip for now
    </Button>
  );
}

export const firstMoneyStep: ShellStepModule = {
  id: "money",
  label: "First money",
  question: () => "What do you have right now?",
  reason: (d) => (d.rhythm.nextDate ? "Salin turns it into a number for today: what's fine to spend until the next one arrives." : "Salin turns it into a number for today: what's fine to spend this week."),
  Body: FirstMoneyBody,
  Extra: SkipExtra,
  validate: validateFirstMoney,
  primaryLabel: () => "Show me my day",
  /** Drop amounts typed for an account that was unticked since (they don't count in the split either). */
  onAdvance: (d) => ({ firstMoney: { ...d.firstMoney, extra: Object.fromEntries(Object.entries(d.firstMoney.extra).filter(([id]) => id !== d.landingAccountId && d.accounts.some((a) => a.id === id))) } }),
  finishOn: () => "done",
};
