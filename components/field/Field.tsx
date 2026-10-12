"use client";

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import styles from "./field.module.css";

export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

export type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  /** Inline error, rendered with role="alert" under the control. Say what is wrong and how to fix it. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Receives the id and aria props to spread onto your input/select. */
  children: (control: FieldControlProps) => ReactNode;
};

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const uid = useId();
  const id = `f-${uid}`;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {/* The alert container stays mounted so the message is announced when it appears. */}
      <div id={errId} role="alert" className={styles.error}>
        {error}
      </div>
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input {...rest} className={cn(styles.control, className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(styles.control, styles.select, className)}>
      {children}
    </select>
  );
}
