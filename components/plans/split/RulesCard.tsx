"use client";

import { useState } from "react";
import { Card } from "@/components/card/Card";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import { setPlanSwitchTarget } from "@/lib/actions/plans";
import { SAVE_FAILED, type ActionResult } from "@/lib/actions/result";
import type { RedirectRule, SwitchRule } from "@/lib/data/plans";
import { MAX_MINOR, formatPeso, parseMoney } from "@/lib/money";
import { longDate, minorToInput } from "../shared";
import styles from "./split.module.css";

type Props = {
  switchRule: SwitchRule | null;
  redirectRule: RedirectRule | null;
  setTarget?: (targetMinor: number) => Promise<ActionResult>;
};

const TARGET_ERROR = "Enter an amount above ₱0 and up to ₱10,000,000.";

export function RulesCard({ switchRule, redirectRule, setTarget = setPlanSwitchTarget }: Props) {
  const announce = useAnnounce();
  const [savedMinor, setSavedMinor] = useState(switchRule?.targetMinor ?? 0);
  const [raw, setRaw] = useState(minorToInput(savedMinor));
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const parsed = parseMoney(raw, { max: MAX_MINOR });
    if (!parsed.ok) {
      setError(TARGET_ERROR);
      return;
    }
    setError(null);
    if (parsed.minor === savedMinor) {
      setRaw(minorToInput(savedMinor));
      return;
    }
    let result: ActionResult;
    try {
      result = await setTarget(parsed.minor);
    } catch {
      result = { ok: false, error: SAVE_FAILED };
    }
    if (result.ok) {
      setSavedMinor(parsed.minor);
      setRaw(minorToInput(parsed.minor));
      announce(`Plan B switch is now ${formatPeso(parsed.minor)}. It is also your Emergency fund target. Applies to paydays from now on.`);
    } else {
      setRaw(minorToInput(savedMinor));
      setError(result.error);
      announce(result.error);
    }
  }

  return (
    <Card aria-labelledby="rules-h">
      <h2 id="rules-h" className={styles.h2} style={{ marginBottom: 12 }}>
        Rules
      </h2>
      <div className={styles.rules}>
        {switchRule ? (
          <div className={styles.rule}>
            <div className={styles.ruleBody}>
              <span>
                <b>Switch to Plan {switchRule.toPlan}</b> when the {switchRule.bucketName} reaches the amount below. Now{" "}
                <span data-testid="switch-now">{formatPeso(switchRule.nowMinor)}</span>.
              </span>
              <div
                className={styles.target}
                onBlur={() => void commit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commit();
                  }
                }}
              >
                <MoneyInput
                  label="Plan B switch amount"
                  hint="This is also your Emergency fund target."
                  value={raw}
                  onValueChange={(v) => {
                    setRaw(v);
                    setError(null);
                  }}
                  error={error}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.rule}>
            <span>
              <b>One plan for now.</b> There is no Plan B switch, so every payday uses Plan A.
            </span>
          </div>
        )}
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
            <b>Changing a percentage or where a bucket is kept</b> only affects paydays after the change.
          </span>
        </div>
      </div>
    </Card>
  );
}
