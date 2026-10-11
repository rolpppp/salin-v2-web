import { Button } from "@/components/button/Button";
import fieldStyles from "@/components/field/field.module.css";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/data/money-in-model";
import { formatPeso } from "@/lib/money";
import { initIncome, setMain, setRule, validateAppIncome } from "@/lib/onboarding/appPath";
import { CADENCE_LABEL, FREQUENCY_OPTIONS, type Frequency } from "@/lib/onboarding/labels";
import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepBodyProps } from "@/lib/onboarding/step";
import { useOnboardingEnv } from "../env";
import styles from "./app-steps.module.css";

type Rule = "plan" | "own" | "whole" | "ask";
const RULE_OPTIONS: ReadonlyArray<{ value: Rule; label: string }> = [
  { value: "plan", label: "Split by my plan" },
  { value: "whole", label: "Keep it whole" },
  { value: "own", label: "Its own split" },
  { value: "ask", label: "Ask me each time" },
];

function AppIncomeBody({ draft, ctx, update, errorField }: StepBodyProps) {
  const { facts, switchToWeb } = useOnboardingEnv();

  if (!facts || draft.sources.length === 0) {
    return (
      <>
        <p className={styles.note}>We didn&apos;t find any income on your phone in the last 90 days. Log a payday in the app, or set up from scratch here.</p>
        <div>
          <Button id="ob-scratch" variant="soft" onClick={switchToWeb}>
            Set up from scratch
          </Button>
        </div>
      </>
    );
  }

  const scholarship = draft.sources.find((s) => !s.isMain && s.kind === "scholarship" && s.rule === "whole");
  const own = draft.sources.some((s) => !s.isMain && s.rule === "own");
  const paydayError = errorField === "ob-next-payday";

  return (
    <>
      <fieldset className={cn(styles.fs, styles.incs)}>
        <legend className="sr">Pick your main pay</legend>
        {draft.sources.map((src, i) => {
          const found = facts.sources.find((s) => s.categoryId === src.key);
          const ruleId = `ob-rule-${i}`;
          return (
            <div key={src.key} className={cn(styles.inc, src.isMain && styles.main)}>
              <label className={styles.incMain}>
                <input
                  type="radio"
                  name="ob-main"
                  id={`ob-main-${i}`}
                  checked={src.isMain}
                  aria-invalid={errorField === `ob-main-${i}` ? true : undefined}
                  onChange={() => {
                    const patch = setMain(draft, facts, src.key);
                    if (patch) update(patch);
                  }}
                />
                <span className={styles.radio} aria-hidden="true" />
                <span>
                  <b>{src.name}</b>
                  {found ? <small>{found.recent.map((r) => `${formatPeso(r.amountMinor)} ${shortDate(r.date)}`).join(" · ")}</small> : null}
                  <small>
                    {found ? CADENCE_LABEL[found.cadence] : ""}
                    {src.isMain ? `${found ? " · " : ""}your main pay` : ""}
                  </small>
                </span>
              </label>
              <div>
                <label htmlFor={ruleId} className="sr">
                  Rule for {src.name}
                </label>
                <select
                  id={ruleId}
                  className={cn(fieldStyles.control, fieldStyles.select)}
                  value={src.isMain ? "plan" : src.rule}
                  disabled={src.isMain}
                  onChange={(e) => {
                    const patch = setRule(draft, src.key, e.target.value as Rule);
                    if (patch) update(patch);
                  }}
                >
                  {RULE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </fieldset>
      <div className={styles.row2}>
        <div className={styles.fld}>
          <label htmlFor="ob-frequency" className={fieldStyles.label}>
            How often does your main pay come?
          </label>
          <select
            id="ob-frequency"
            className={cn(fieldStyles.control, fieldStyles.select)}
            value={draft.income.frequency ?? "varies"}
            onChange={(e) => update({ income: { ...draft.income, frequency: e.target.value as Frequency } })}
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.fld}>
          <label htmlFor="ob-next-payday" className={fieldStyles.label}>
            Next main payday
          </label>
          <input
            id="ob-next-payday"
            type="date"
            className={fieldStyles.control}
            min={ctx.todayIso}
            value={draft.income.nextPayday ?? ""}
            aria-invalid={paydayError ? true : undefined}
            aria-describedby="ob-next-payday-hint"
            onChange={(e) => update({ income: { ...draft.income, nextPayday: e.target.value || null } })}
          />
          <p id="ob-next-payday-hint" className={styles.hint}>
            Guessed from your last paydays. Change it if it&apos;s off.
          </p>
        </div>
      </div>
      <p className={styles.note}>
        {scholarship ? `${scholarship.name} is kept whole in Scholarship, so it's never split.` : "You can change any rule later in Plans."}
        {own ? " You'll set an own split in Plans." : ""}
      </p>
    </>
  );
}

/** SPEC §7.4 step 2 (app path). */
export const appIncomeStep: ShellStepModule = {
  id: "income",
  label: "Income",
  question: () => "Here's the money we found coming in",
  reason: () => "From your last 90 days on the phone. Pick your main pay; your plan is built around it. Other money gets its own rule.",
  Body: AppIncomeBody,
  validate: validateAppIncome,
  enterWithFacts: (draft, _ctx, facts) => initIncome(draft, facts),
};
