"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Field } from "@/components/field/Field";
import { cn } from "@/lib/cn";
import styles from "./money-input.module.css";

/** Result of parsing what the user typed. `minor` is integer centavos. */
export type MoneyParseResult = { ok: true; minor: number } | { ok: false; error: string };

export type MoneyInputProps = {
  label: ReactNode;
  hint?: ReactNode;
  /** External error (e.g. from a server action). Parse errors are shown when this is absent. */
  error?: ReactNode;
  name?: string;
  /** Controlled raw text. */
  value?: string;
  defaultValue?: string;
  /** Called on every edit with the raw text and, if `parse` is given, the parse result. */
  onValueChange?: (raw: string, parsed: MoneyParseResult | null) => void;
  /** Parser from lib/money (wired in a later ticket). Run on blur to validate. */
  parse?: (raw: string) => MoneyParseResult;
  /** "lg" is the 16px/650 variant used by Add income. */
  size?: "md" | "lg";
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
};

export function MoneyInput({
  label,
  hint,
  error,
  name,
  value,
  defaultValue = "",
  onValueChange,
  parse,
  size = "md",
  required,
  disabled,
  autoFocus,
  placeholder = "0.00",
  className,
}: MoneyInputProps) {
  const [inner, setInner] = useState(defaultValue);
  const [parseError, setParseError] = useState<string | null>(null);
  const raw = value ?? inner;
  const shownError = error ?? parseError;

  return (
    <Field label={label} hint={hint} error={shownError} required={required} className={className}>
      {(control) => (
        <div className={cn(styles.group, size === "lg" && styles.lg)} data-invalid={shownError ? true : undefined}>
          <span className={styles.prefix} aria-hidden="true">
            ₱
          </span>
          <input
            {...control}
            className={styles.input}
            name={name}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={raw}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            data-amount
            onChange={(e) => {
              const next = e.target.value;
              if (value === undefined) setInner(next);
              if (parseError) setParseError(null);
              onValueChange?.(next, parse ? parse(next) : null);
            }}
            onBlur={() => {
              if (!parse || raw.trim() === "") return;
              const r = parse(raw);
              setParseError(r.ok ? null : r.error);
            }}
          />
        </div>
      )}
    </Field>
  );
}
