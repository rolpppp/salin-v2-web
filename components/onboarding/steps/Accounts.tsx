"use client";

import { useState } from "react";
import { Button } from "@/components/button/Button";
import { BankMark } from "@/components/brand/BankMark";
import { Select } from "@/components/field/Field";
import type { DraftAccount } from "@/lib/onboarding/draft";
import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepBodyProps } from "@/lib/onboarding/step";
import {
  ACCOUNTS_QUESTION,
  ACCOUNTS_REASON,
  CUSTOM_ACCOUNT_TYPES,
  WEB_FIELDS,
  accountChips,
  addCustomAccount,
  setLanding,
  toggleAccount,
  validateWebAccounts,
} from "@/lib/onboarding/web-path";
import { isSimple } from "@/lib/onboarding/simple-path";
import { useOnboardingEnv } from "../env";
import { StepTextField } from "./fields";
import styles from "./steps.module.css";

/** SPEC §7.3 step 2 (web path). Each ticked account gets its id right here, so later steps can refer to it. */
function AccountsBody({ draft, update, errorField, announce }: StepBodyProps) {
  const { userId } = useOnboardingEnv();
  const [custom, setCustom] = useState("");
  const [customType, setCustomType] = useState<DraftAccount["type"]>("bank");
  const [customError, setCustomError] = useState<string | null>(null);
  const chips = accountChips(draft);

  const addCustom = () => {
    const r = addCustomAccount(draft, userId, custom, customType);
    if (!r.ok) {
      setCustomError(r.message);
      document.getElementById(WEB_FIELDS.customName)?.focus();
      return;
    }
    setCustomError(null);
    setCustom("");
    update(r.patch);
    announce(`${r.name} added.`);
    document.getElementById(WEB_FIELDS.customName)?.focus();
  };

  return (
    <div className={styles.stack}>
      <fieldset className={styles.fs}>
        <legend className="sr">Accounts you keep money in</legend>
        <div className={styles.chips}>
          {chips.map((c, i) => {
            const on = draft.accounts.some((a) => a.name.toLowerCase() === c.name.toLowerCase());
            return (
              <label key={c.name} className={styles.chipOpt}>
                <input
                  type="checkbox"
                  id={`ob-acct-${i}`}
                  checked={on}
                  aria-invalid={errorField === WEB_FIELDS.firstAccount && i === 0 ? true : undefined}
                  onChange={(e) => {
                    update(toggleAccount(draft, userId, c, e.target.checked));
                    if (!e.target.checked && c.custom) announce(`${c.name} removed.`);
                  }}
                />
                <span className={styles.chipBank}>
                  <BankMark name={c.name} size="sm" />
                  {c.name} <small>{c.label}</small>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Enter in this field adds the account; it must not continue the step. */}
      <div
        className={styles.row2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).id === WEB_FIELDS.customName) {
            e.preventDefault();
            addCustom();
          }
        }}
      >
        <StepTextField
          id={WEB_FIELDS.customName}
          label="Another account"
          placeholder="e.g. Security Bank"
          maxLength={40}
          value={custom}
          invalid={customError !== null}
          onValueChange={(v) => {
            setCustom(v);
            setCustomError(null);
          }}
        />
        <div className={styles.fld}>
          <label htmlFor="ob-custom-type" className={styles.fldLabel}>
            What kind is it?
          </label>
          <Select id="ob-custom-type" value={customType} onChange={(e) => setCustomType(e.target.value as DraftAccount["type"])}>
            {CUSTOM_ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Button
          variant="soft"
          type="button"
          onClick={addCustom}
        >
          Add account
        </Button>
        {customError ? (
          <p role="alert" className={styles.fldErr}>
            {customError}
          </p>
        ) : null}
      </div>

      <div className={styles.fld}>
        <label htmlFor={WEB_FIELDS.landing} className={styles.fldLabel}>
          {isSimple(draft) ? "Money usually lands in" : "Your pay lands in"}
        </label>
        <Select
          id={WEB_FIELDS.landing}
          value={draft.landingAccountId ?? ""}
          disabled={draft.accounts.length === 0}
          aria-invalid={errorField === WEB_FIELDS.landing ? true : undefined}
          onChange={(e) => update(setLanding(draft, e.target.value || null))}
        >
          {draft.accounts.length === 0 ? (
            <option value="">Pick accounts above first</option>
          ) : (
            <>
              <option value="">Choose an account</option>
              {draft.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </>
          )}
        </Select>
      </div>
    </div>
  );
}

export const accountsStep: ShellStepModule = {
  id: "accounts",
  label: "Accounts",
  question: () => ACCOUNTS_QUESTION,
  reason: () => ACCOUNTS_REASON,
  Body: AccountsBody,
  validate: (draft) => validateWebAccounts(draft),
};
