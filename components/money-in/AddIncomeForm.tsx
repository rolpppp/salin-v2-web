"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Field, Input, Select } from "@/components/field/Field";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import { addIncomeAction } from "@/lib/actions/money-in";
import {
  ADD_INCOME_FIELD_ORDER,
  rateText,
  ruleJobText,
  validateAddIncome,
  type AddIncomeErrors,
  type AddIncomeField,
  type MiSource,
  type MoneyInData,
} from "@/lib/data/money-in-model";
import { activePlan } from "@/lib/money";
import styles from "./money-in.module.css";
import { StepHead } from "./StepHead";

export type AddIncomeFormProps = {
  data: MoneyInData;
  onCancel: () => void;
  /** Called after the income was written; the parent selects the new row and moves focus to it. */
  onAdded: (entryId: string, sourceName: string) => void;
};

/** SPEC §2.2. Owns the primary button while open. */
export function AddIncomeForm({ data, onCancel, onAdded }: AddIncomeFormProps) {
  const sources = data.sources.filter((s) => !s.isArchived);
  const accounts = data.accounts.filter((a) => !a.isArchived && a.currency === data.homeCurrency);
  const defaultLanded = (s: MiSource | undefined) => (s?.landsInAccountId && accounts.some((a) => a.id === s.landsInAccountId) ? s.landsInAccountId : (accounts[0]?.id ?? ""));

  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(data.todayIso);
  const [landedIn, setLandedIn] = useState(defaultLanded(sources[0]));
  const [aud, setAud] = useState("");
  const [errors, setErrors] = useState<AddIncomeErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const source = sources.find((s) => s.id === sourceId);
  const showAud = source?.kind === "salary";
  const blocked = sources.length === 0 ? "no_sources" : accounts.length === 0 ? "no_accounts" : null;
  const planKey = activePlan(data.plan.emergencyAllocatedSoFar, data.plan.switchTarget, data.plan.activePlan, data.plan.switchOn);
  const job = source ? ruleJobText(source, data.buckets, planKey, data.plan) : null;

  function focusField(field: AddIncomeField) {
    formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"] input, [data-field="${field}"] select`)?.focus();
  }

  function clearError(field: AddIncomeField) {
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || blocked) return;
    setFormError(null);
    const input = { sourceId, amount, date, landedIn, aud };
    const v = validateAddIncome(input, { todayIso: data.todayIso, showAud });
    if (!v.ok) {
      setErrors(v.errors);
      focusField(v.first);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await addIncomeAction({ ...input, aud: showAud ? aud : "" });
      if (r.ok) {
        onAdded(r.entryId, source?.name ?? "Income");
        return;
      }
      if (r.errors) {
        setErrors(r.errors);
        const first = ADD_INCOME_FIELD_ORDER.find((f) => r.errors?.[f]);
        if (first) focusField(first);
      }
      if (r.error) setFormError(r.error);
    } catch {
      setFormError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="money-in-add-h" className={styles.addForm} data-testid="add-income-form">
      <StepHead n="+" id="money-in-add-h" title="Add income" sub="Logged on your phone? It shows up here by itself." />
      <form ref={formRef} onSubmit={submit} noValidate aria-label="Add income">
        <div className={styles.grid}>
          <div data-field="source">
            <Field label="Source" error={errors.source}>
              {(c) => (
                <Select
                  {...c}
                  value={sourceId}
                  onChange={(e) => {
                    const next = sources.find((s) => s.id === e.target.value);
                    setSourceId(e.target.value);
                    setLandedIn(defaultLanded(next));
                    clearError("source");
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div data-field="amount">
            <MoneyInput
              label="Amount received"
              size="lg"
              name="amount"
              autoFocus
              value={amount}
              error={errors.amount}
              onValueChange={(raw) => {
                setAmount(raw);
                clearError("amount");
              }}
            />
          </div>
          <div data-field="date">
            <Field label="Date" error={errors.date}>
              {(c) => (
                <Input
                  {...c}
                  type="date"
                  name="date"
                  value={date}
                  max={data.todayIso}
                  onChange={(e) => {
                    setDate(e.target.value);
                    clearError("date");
                  }}
                />
              )}
            </Field>
          </div>
          <div data-field="landedIn">
            <Field label="Landed in" error={errors.landedIn}>
              {(c) => (
                <Select
                  {...c}
                  value={landedIn}
                  onChange={(e) => {
                    setLandedIn(e.target.value);
                    clearError("landedIn");
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {showAud ? (
            <>
              <div data-field="aud">
                <MoneyInput
                  label={
                    <>
                      Sent from AUD <em className={styles.optional}>optional</em>
                    </>
                  }
                  prefix="A$"
                  size="lg"
                  name="aud"
                  value={aud}
                  error={errors.aud}
                  onValueChange={(raw) => {
                    setAud(raw);
                    clearError("aud");
                  }}
                />
              </div>
              <p className={styles.rate} data-testid="rate-text">
                {rateText(amount, aud)}
              </p>
            </>
          ) : null}
        </div>

        <p className={styles.rule} data-testid="add-income-rule">
          {blocked === "no_sources" ? (
            <>You have no income source yet. Add one in Plans first.</>
          ) : blocked === "no_accounts" ? (
            <>You have no peso account yet. Add one in Plans first.</>
          ) : job?.kind === "job" ? (
            <>
              Its job: <b>{job.text}</b>.
            </>
          ) : (
            job?.text
          )}{" "}
          <Link href="/plans/income" className={styles.link}>
            Change rules in Plans
          </Link>
        </p>
        <p className={styles.formError} role="alert">
          {formError}
        </p>
        <div className={styles.row}>
          <Button type="submit" variant="primary" loading={busy} loadingLabel="Adding" disabled={blocked !== null}>
            Add to Money in
          </Button>
          <Button variant="quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
