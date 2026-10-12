"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Select } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import { SAVE_FAILED, type ActionResult } from "@/lib/actions/result";
import type { PlanSettings, RedirectRule } from "@/lib/data/plans";
import { MAX_MINOR, formatPeso, parseMoney } from "@/lib/money";
import { longDate, minorToInput } from "../shared";
import { autoActiveKey, choiceFromSettings, choiceProblem, sameChoice, type ActiveChoice } from "./logic";
import styles from "./split.module.css";

type Props = {
  settings: PlanSettings;
  plans: Array<{ key: string; name: string }>;
  redirectRule: RedirectRule | null;
  setTarget: (targetMinor: number) => Promise<ActionResult>;
  setActivePlan: (input: { mode: "manual"; planKey: string } | { mode: "auto"; from: string; to: string }) => Promise<ActionResult>;
  /** Called after a successful save so the plan bar's "Splitting your paydays" marker follows. */
  onSaved?: (settings: Pick<PlanSettings, "mode" | "activeKey" | "autoFrom" | "autoTo">) => void;
};

const TARGET_ERROR = "Enter an amount above ₱0 and up to ₱10,000,000.";

/** "Which plan splits your paydays": Automatic (switch from one plan to another at the Emergency target) or Always use one plan. */
export function RulesCard({ settings, plans, redirectRule, setTarget, setActivePlan, onSaved }: Props) {
  const announce = useAnnounce();
  const keys = plans.map((p) => p.key);
  const nameOf = (k: string) => plans.find((p) => p.key === k)?.name ?? k;
  const canAuto = plans.length >= 2;

  const saved = choiceFromSettings(settings);
  const [savedChoice, setSavedChoice] = useState<ActiveChoice>(saved);
  const [mode, setMode] = useState<"auto" | "manual">(canAuto ? settings.mode : "manual");
  const [from, setFrom] = useState(settings.autoFrom);
  const [to, setTo] = useState(settings.autoTo);
  const [manualKey, setManualKey] = useState(settings.mode === "manual" ? settings.activeKey : (keys[0] ?? settings.activeKey));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errRef = useRef<HTMLParagraphElement>(null);

  const [savedTarget, setSavedTarget] = useState(settings.targetMinor ?? 0);
  const [raw, setRaw] = useState(minorToInput(savedTarget));
  const [targetError, setTargetError] = useState<string | null>(null);

  // The parent remounts this card when the set of plans changes, so the choices never point at a deleted plan.
  useEffect(() => {
    if (error) errRef.current?.focus();
  }, [error]);

  const choice: ActiveChoice = mode === "manual" ? { mode: "manual", planKey: manualKey } : { mode: "auto", from, to };
  const problem = choiceProblem(choice, keys);
  const changed = !sameChoice(choice, savedChoice);

  async function saveChoice() {
    if (problem || !changed) return;
    setSaving(true);
    setError(null);
    let r: ActionResult;
    try {
      r = await setActivePlan(choice.mode === "manual" ? { mode: "manual", planKey: choice.planKey } : { mode: "auto", from: choice.from, to: choice.to });
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    setSaving(false);
    if (r.ok) {
      setSavedChoice(choice);
      onSaved?.(choice.mode === "manual" ? { mode: "manual", activeKey: choice.planKey, autoFrom: from, autoTo: to } : { mode: "auto", activeKey: autoActiveKey(choice.from, choice.to, settings.nowMinor, savedTarget), autoFrom: choice.from, autoTo: choice.to });
      announce(
        choice.mode === "manual"
          ? `${nameOf(choice.planKey)} will split every payday from now on.`
          : `Paydays use ${nameOf(choice.from)} until your Emergency fund reaches ${formatPeso(savedTarget)}, then ${nameOf(choice.to)}. Applies to paydays after the change.`,
      );
    } else {
      setError(r.error);
      announce(r.error);
    }
  }

  async function commitTarget() {
    const parsed = parseMoney(raw, { max: MAX_MINOR });
    if (!parsed.ok) {
      setTargetError(TARGET_ERROR);
      return;
    }
    setTargetError(null);
    if (parsed.minor === savedTarget) {
      setRaw(minorToInput(savedTarget));
      return;
    }
    let r: ActionResult;
    try {
      r = await setTarget(parsed.minor);
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    if (r.ok) {
      setSavedTarget(parsed.minor);
      setRaw(minorToInput(parsed.minor));
      announce(`The switch amount is now ${formatPeso(parsed.minor)}. It is also your Emergency fund target. Applies to paydays from now on.`);
    } else {
      setRaw(minorToInput(savedTarget));
      setTargetError(r.error);
      announce(r.error);
    }
  }

  const planSelect = (label: string, value: string, onChange: (v: string) => void, disabled: boolean, exclude?: string) => (
    <Select aria-label={label} className={`${styles.mini} ${styles.inlineSelect}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {plans.map((p) => (
        <option key={p.key} value={p.key} disabled={p.key === exclude}>
          {p.name}
        </option>
      ))}
    </Select>
  );

  return (
    <Card aria-labelledby="rules-h">
      <h2 id="rules-h" className={styles.h2} style={{ marginBottom: 12 }}>
        Which plan splits your paydays
      </h2>
      <fieldset className={styles.fieldset}>
        <legend className="sr">Which plan splits your paydays</legend>
        <div className={styles.choice}>
          <label className={styles.choiceHead}>
            <input type="radio" name="plan-mode" value="auto" checked={mode === "auto"} disabled={!canAuto} onChange={() => setMode("auto")} />
            <b>Automatic</b>
          </label>
          <div className={styles.choiceBody}>
            <div className={styles.sentence}>
              Use {planSelect("Automatic: start with plan", from, setFrom, mode !== "auto", to)} until {settings.emergencyName} reaches
              {settings.targetMinor !== null ? " " : " the target you set, "}
              {settings.targetMinor !== null ? (
                <span
                  className={styles.target}
                  onBlur={() => void commitTarget()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitTarget();
                    }
                  }}
                >
                  <MoneyInput
                    label={<span className="sr">Switch amount in pesos</span>}
                    value={raw}
                    onValueChange={(v) => {
                      setRaw(v);
                      setTargetError(null);
                    }}
                    error={targetError}
                    disabled={mode !== "auto"}
                  />
                </span>
              ) : null}
              , then {planSelect("Automatic: then switch to plan", to, setTo, mode !== "auto", from)}.
            </div>
            {settings.targetMinor !== null ? (
              <p className={styles.hint}>
                Now <span data-testid="switch-now">{formatPeso(settings.nowMinor)}</span>. The amount is also your Emergency fund target.
              </p>
            ) : null}
            {!canAuto ? <p className={styles.hint}>Automatic needs two plans. Make another plan first.</p> : null}
          </div>
        </div>

        <div className={styles.choice}>
          <label className={styles.choiceHead}>
            <input type="radio" name="plan-mode" value="manual" checked={mode === "manual"} onChange={() => setMode("manual")} />
            <b>Always use</b>
            {planSelect("Always use plan", manualKey, setManualKey, mode !== "manual")}
          </label>
        </div>
      </fieldset>

      <div className={styles.saveRow}>
        <Button variant="primary" onClick={() => void saveChoice()} disabled={!changed || problem !== null} loading={saving} loadingLabel="Saving">
          Save
        </Button>
        <p className={styles.saveNote}>{problem ?? "Applies to paydays after the change."}</p>
      </div>
      <p ref={errRef} tabIndex={-1} className={styles.err} role="alert" data-testid="active-plan-error">
        {error}
      </p>

      <div className={styles.rules} style={{ marginTop: 14 }}>
        {redirectRule ? (
          <div className={styles.rule}>
            <span data-testid="redirect-rule">
              <b>
                {redirectRule.fromBucketName}&rsquo;s share goes to {redirectRule.toBucketName}
              </b>{" "}
              until {longDate(redirectRule.untilDate)}.
            </span>
          </div>
        ) : null}
        <div className={styles.rule}>
          <span>
            <b>Changing a percentage, a plan or where a bucket is kept</b> only affects paydays after the change.
          </span>
        </div>
      </div>
    </Card>
  );
}
