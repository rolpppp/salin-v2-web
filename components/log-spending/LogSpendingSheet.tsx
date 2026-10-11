"use client";

import { useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Button } from "@/components/button/Button";
import { Drawer } from "@/components/drawer/Drawer";
import { Field, Input, Select } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import { logSpending } from "@/lib/actions/spending";
import {
  LOG_FIELD_ORDER,
  NOTE_MAX,
  computeImpact,
  defaultPaidFrom,
  impactParts,
  validateLogSpending,
  type LogField,
  type LogSpendingData,
  type LogSpendingErrors,
  type LoggedImpact,
} from "@/lib/data/log-spending-model";
import { SAVE_FAILED } from "@/lib/data/money-in-model";
import { formatPeso, moneyErrorMessage, parseMoney } from "@/lib/money";
import styles from "./log-spending.module.css";

export type LoggedInfo = { amountMinor: number; label: string; impact: LoggedImpact };

export type LogSpendingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: LogSpendingData;
  /** The "+ Log spending" button, so focus can go back to it when the sheet closes. */
  launcher: () => HTMLElement | null;
  /** Called after each successful write (both buttons). */
  onLogged: (info: LoggedInfo) => void;
};

const parseSpent = (raw: string) => {
  const r = parseMoney(raw);
  return r.ok ? r : { ok: false as const, error: moneyErrorMessage("spent", r.error) };
};

/** SPEC §8. The launcher gives it a new `key` on every opening, so each opening starts from a clean draft. */
export function LogSpendingSheet({ open, onOpenChange, data, launcher, onLogged }: LogSpendingSheetProps) {
  const announce = useAnnounce();
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const [date, setDate] = useState(data.todayIso);
  const [errors, setErrors] = useState<LogSpendingErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"one" | "again" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const bucketById = new Map(data.groups.map((g) => [g.bucket.id, g.bucket]));
  const category = data.groups.flatMap((g) => g.categories).find((c) => c.id === categoryId);
  const bucket = category ? bucketById.get(category.bucketId) : undefined;
  const blocked = data.groups.length === 0 ? "no_categories" : data.accounts.length === 0 ? "no_accounts" : null;

  const typed = parseMoney(amount);
  const impact = bucket
    ? computeImpact({ bucket, leftMinor: data.lefts[bucket.id] ?? 0, safeMinor: data.safeMinor, daysUntilPayday: data.daysUntilPayday, amountMinor: typed.ok ? typed.minor : null })
    : null;
  const parts = impact ? impactParts(impact) : null;

  const focusField = (field: LogField) => {
    formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"] input, [data-field="${field}"] select`)?.focus();
  };
  const clearError = (field: LogField) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  async function submit(again: boolean) {
    if (busy || blocked) return;
    setFormError(null);
    const input = { amount, categoryId, note, accountId, date };
    const v = validateLogSpending(input, { todayIso: data.todayIso });
    if (!v.ok) {
      setErrors(v.errors);
      focusField(v.first);
      return;
    }
    setErrors({});
    setBusy(again ? "again" : "one");
    try {
      const r = await logSpending(input);
      if (!r.ok) {
        if (r.errors) {
          setErrors(r.errors);
          focusField(r.first ?? LOG_FIELD_ORDER.find((f) => r.errors?.[f]) ?? "amount");
        }
        if (r.error) setFormError(r.error);
        return;
      }
      const label = v.value.note ?? r.categoryName;
      onLogged({ amountMinor: v.value.amountMinor, label, impact: r.impact });
      announce(`Logged ${formatPeso(v.value.amountMinor)} for ${label}. ${r.impact.bucketName} has ${formatPeso(r.impact.bucketLeftMinor)} left.`);
      if (again) {
        setAmount("");
        setNote("");
        requestAnimationFrame(() => focusField("amount"));
      } else {
        onOpenChange(false);
      }
    } catch {
      setFormError(SAVE_FAILED);
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Log spending"
      description="Add something you spent. It comes out of the bucket its category sits in."
      initialFocus={() => formRef.current?.querySelector<HTMLElement>('[data-field="amount"] input')}
      returnFocus={launcher}
    >
      <form ref={formRef} onSubmit={onSubmit} noValidate aria-label="Log spending" className={styles.form} data-testid="log-spending-form">
        <div data-field="amount">
          <MoneyInput
            label="Amount"
            size="lg"
            name="amount"
            value={amount}
            error={errors.amount}
            parse={parseSpent}
            onValueChange={(raw) => {
              setAmount(raw);
              clearError("amount");
            }}
          />
        </div>
        <div data-field="category">
          <Field label="Category" error={errors.category}>
            {(c) => (
              <Select
                {...c}
                name="category"
                value={categoryId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCategoryId(id);
                  const next = data.groups.flatMap((g) => g.categories).find((x) => x.id === id);
                  if (next) setAccountId(defaultPaidFrom(bucketById.get(next.bucketId), data.accounts));
                  clearError("category");
                  clearError("account");
                }}
              >
                <option value="">Choose a category</option>
                {data.groups.map((g) => (
                  <optgroup key={g.bucket.id} label={g.bucket.name}>
                    {g.categories.map((c2) => (
                      <option key={c2.id} value={c2.id}>
                        {c2.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className={styles.impact} data-testid="log-impact" data-negative={parts?.negative ? true : undefined}>
          {bucket && parts ? (
            <>
              {bucket.hue ? <i className={styles.dot} style={{ "--c": `var(--b-${bucket.hue}, var(--ink-3))` } as CSSProperties} aria-hidden="true" /> : null}
              <span>
                {parts.lead}
                {parts.after ? (
                  <>
                    {" → "}
                    <b className={parts.negative ? styles.warm : undefined}>{parts.after}</b>
                  </>
                ) : null}
                {parts.perDay ? <small>{parts.perDay}</small> : null}
              </span>
            </>
          ) : (
            <span className={styles.muted}>Pick a category to see which bucket it comes from.</span>
          )}
        </div>
        <div data-field="note">
          <Field
            label={
              <>
                What was it? <em className={styles.optional}>optional</em>
              </>
            }
          >
            {(c) => <Input {...c} name="note" maxLength={NOTE_MAX} autoComplete="off" placeholder="e.g. Lunch with team" value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>
        <div className={styles.pair}>
          <div data-field="account">
            <Field label="Paid from" error={errors.account}>
              {(c) => (
                <Select
                  {...c}
                  name="account"
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    clearError("account");
                  }}
                >
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
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
        </div>
        {blocked ? (
          <p className={styles.muted}>
            {blocked === "no_categories" ? "You have no spending categories yet. Add one in Plans first." : "You have no peso account yet. Add one in Plans first."}
          </p>
        ) : null}
        <p className={styles.formError} role="alert">
          {formError}
        </p>
        <div className={styles.row}>
          <Button type="submit" variant="primary" loading={busy === "one"} loadingLabel="Saving" disabled={blocked !== null || busy === "again"}>
            Log it
          </Button>
          <Button variant="soft" loading={busy === "again"} loadingLabel="Saving" disabled={blocked !== null || busy === "one"} onClick={() => void submit(true)}>
            Log and add another
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
