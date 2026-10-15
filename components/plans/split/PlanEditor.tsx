"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "@/components/button/Button";
import { Input, Select } from "@/components/field/Field";
import type { ActionResult } from "@/lib/actions/result";
import { SAVE_FAILED } from "@/lib/actions/result";
import type { PlanBucket } from "@/lib/data/plans";
import { formatPeso } from "@/lib/money";
import { bpToPercent, hueColor } from "../shared";
import { canSave, checkPlan, differsFromSaved, nameProblem, saveNote, shareOfPay, stepPercent, totalHint, type PlanDraft } from "./logic";
import styles from "./split.module.css";

type Existing = { kind: "existing"; planKey: string; name: string; isActive: boolean };
type Mode = Existing | { kind: "new" };

type Props = {
  mode: Mode;
  buckets: PlanBucket[];
  draft: PlanDraft;
  /** Last saved numbers (existing plans); null for a new draft. */
  saved: PlanDraft | null;
  onDraft: (bucketId: string, value: string) => void;
  /** Other plans, for the read-only "Compare with" column. */
  compareOptions: Array<{ key: string; name: string; lines: Record<string, number> }>;
  /** Names of the other live plans (for the uniqueness check before a round trip). */
  takenNames: string[];
  /** A typical pay in centavos, when the page has one: shows what each share comes to. */
  typicalPayMinor?: number | null;
  /** Focus the name field when it appears (after creating a plan). */
  focusName?: boolean;
  onRename: (name: string) => Promise<ActionResult>;
  onDelete: () => Promise<ActionResult>;
  /** Existing: saves the lines. New: creates the plan with this name. */
  onSave: (name: string) => Promise<ActionResult>;
};

/** Moves focus to an error message when it appears, so keyboard and screen-reader users land on it. */
function useFocusOnError(error: string | null) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  return ref;
}

export function PlanEditor({ mode, buckets, draft, saved, onDraft, compareOptions, takenNames, typicalPayMinor, focusName, onRename, onDelete, onSave }: Props) {
  const isNew = mode.kind === "new";
  const ids = buckets.map((b) => b.id);
  const check = checkPlan(draft, ids);
  const dirty = saved ? differsFromSaved(draft, saved, ids) : true;

  const [name, setName] = useState(mode.kind === "existing" ? mode.name : "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [compareKey, setCompareKey] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const nameErrRef = useFocusOnError(nameError);
  const saveErrRef = useFocusOnError(saveError);
  const delErrRef = useFocusOnError(deleteError);

  useEffect(() => {
    if (focusName || isNew) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
    // Only when the editor opens (it remounts per plan).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compare = compareOptions.find((p) => p.key === compareKey) ?? null;
  const badName = check.invalid[0] ? buckets.find((b) => b.id === check.invalid[0])?.name : undefined;
  const hint = totalHint(check, badName);
  const hasName = name.trim().length > 0;
  const showPay = typeof typicalPayMinor === "number" && typicalPayMinor > 0;
  const extra = (compare ? 1 : 0) + (showPay ? 1 : 0);

  async function commitName() {
    if (mode.kind !== "existing") return;
    const next = name.trim();
    if (next === mode.name) {
      setName(mode.name);
      setNameError(null);
      return;
    }
    const problem = nameProblem(next, takenNames);
    if (problem) {
      setNameError(problem);
      return;
    }
    setNameError(null);
    let r: ActionResult;
    try {
      r = await onRename(next);
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    if (!r.ok) {
      setName(mode.name);
      setNameError(r.error);
    }
  }

  async function save() {
    if (isNew) {
      const problem = nameProblem(name, takenNames);
      if (problem) {
        setNameError(problem);
        nameRef.current?.focus();
        return;
      }
    }
    setBusy(true);
    setSaveError(null);
    setNameError(null);
    let r: ActionResult;
    try {
      r = await onSave(name.trim());
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    setBusy(false);
    if (!r.ok) setSaveError(r.error);
  }

  async function remove() {
    setBusy(true);
    setDeleteError(null);
    let r: ActionResult;
    try {
      r = await onDelete();
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    setBusy(false);
    setConfirming(false);
    if (!r.ok) setDeleteError(r.error);
  }

  return (
    <div className={styles.editor}>
      <div className={styles.nameRow}>
        <div className={styles.nameField}>
          <label htmlFor="plan-name" className={styles.fieldLabel}>
            Plan name
          </label>
          <Input
            id="plan-name"
            ref={nameRef}
            value={name}
            maxLength={40}
            autoComplete="off"
            placeholder={isNew ? "For example, Saving for Japan" : undefined}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "plan-name-err" : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (isNew) nameRef.current?.blur();
                else void commitName();
              }
            }}
          />
          <p id="plan-name-err" ref={nameErrRef} tabIndex={-1} className={styles.err} role="alert">
            {nameError}
          </p>
        </div>
        {mode.kind === "existing" ? (
          <Button variant="quiet" onClick={() => setConfirming(true)} disabled={busy || confirming}>
            Delete plan
          </Button>
        ) : null}
      </div>

      {confirming && mode.kind === "existing" ? (
        <div className={styles.confirm} role="group" aria-label={`Delete ${mode.name}`}>
          <p>
            Delete <b>{mode.name}</b>? Paydays you already confirmed keep their history and this plan&rsquo;s name.
          </p>
          <div className={styles.actions}>
            <Button variant="warm" onClick={() => void remove()} loading={busy} loadingLabel="Deleting">
              Delete {mode.name}
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
      <p ref={delErrRef} tabIndex={-1} className={styles.err} role="alert" data-testid="delete-error">
        {deleteError}
      </p>

      {compareOptions.length > 0 ? (
        <div className={styles.compare}>
          <label htmlFor="compare-with" className={styles.fieldLabel}>
            Compare with
          </label>
          <Select id="compare-with" className={styles.mini} value={compareKey} onChange={(e) => setCompareKey(e.target.value)}>
            <option value="">Nothing</option>
            {compareOptions.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div role="table" aria-label={isNew ? "New plan percentages" : `${mode.name} percentages`} className={styles.table} style={{ "--cols": extra > 0 ? `repeat(${extra}, minmax(70px, 110px))` : "" } as CSSProperties}>
        <div role="row" className={styles.headRow2}>
          <span role="columnheader" className={styles.th}>
            Bucket
          </span>
          <span role="columnheader" className={`${styles.th} ${styles.right}`}>
            Share
          </span>
          {compare ? (
            <span role="columnheader" className={`${styles.th} ${styles.right}`}>
              {compare.name}
            </span>
          ) : null}
          {showPay ? (
            <span role="columnheader" className={`${styles.th} ${styles.right}`}>
              Per {formatPeso(typicalPayMinor as number)} pay
            </span>
          ) : null}
        </div>
        {buckets.map((b) => {
          const pct = Number.parseInt(draft[b.id] ?? "", 10);
          const bad = check.invalid.includes(b.id);
          return (
            <div role="row" key={b.id} className={styles.row2} style={{ "--c": hueColor(b.hue), "--p": Number.isNaN(pct) ? 0 : Math.min(100, Math.max(0, pct)) / 100 } as CSSProperties}>
              <span role="rowheader" className={styles.bucket}>
                <i aria-hidden="true" />
                <span>
                  {b.name}
                  <span className={styles.group}>{b.groupKey === "spend" ? "Spend" : b.groupKey === "save" ? "Save" : "Set aside"}</span>
                </span>
              </span>
              <span role="cell" className={styles.stepper}>
                <button type="button" className={styles.stepBtn} aria-label={`Decrease ${b.name} by 1%`} onClick={() => onDraft(b.id, stepPercent(draft[b.id] ?? "", -1))}>
                  &minus;
                </button>
                <Input
                  className={styles.pct}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={`${b.name} percent`}
                  aria-invalid={bad ? true : undefined}
                  value={draft[b.id] ?? ""}
                  onChange={(e) => onDraft(b.id, e.target.value)}
                />
                <span aria-hidden="true">%</span>
                <button type="button" className={styles.stepBtn} aria-label={`Increase ${b.name} by 1%`} onClick={() => onDraft(b.id, stepPercent(draft[b.id] ?? "", 1))}>
                  +
                </button>
              </span>
              {compare ? (
                <span role="cell" className={`${styles.right} ${styles.muted}`}>
                  {bpToPercent(compare.lines[b.id] ?? 0)}%
                </span>
              ) : null}
              {showPay ? (
                <span role="cell" className={`${styles.right} ${styles.muted}`}>
                  {Number.isNaN(pct) ? "" : formatPeso(shareOfPay(typicalPayMinor as number, pct))}
                </span>
              ) : null}
            </div>
          );
        })}
        <div role="row" className={styles.footRow2}>
          <span role="rowheader">Total</span>
          <span role="cell" className={`${styles.right} ${check.valid ? styles.ok : styles.bad}`} data-testid="plan-total" aria-live="polite" aria-atomic="true">
            {check.total}%{hint ? <span className={styles.totalHint}> {hint}</span> : null}
          </span>
          {compare ? (
            <span role="cell" className={`${styles.right} ${styles.muted}`}>
              {buckets.reduce((t, b) => t + bpToPercent(compare.lines[b.id] ?? 0), 0)}%
            </span>
          ) : null}
          {showPay ? <span role="cell" /> : null}
        </div>
      </div>

      <div className={styles.saveRow}>
        <Button variant="primary" onClick={() => void save()} disabled={!canSave(check, { isNew, dirty, busy, hasName })} loading={busy} loadingLabel="Saving">
          {isNew ? "Create plan" : "Save plan"}
        </Button>
        <p className={styles.saveNote} data-testid="save-note">
          {saveNote(check, { isNew, dirty })}
        </p>
      </div>
      <p ref={saveErrRef} tabIndex={-1} className={styles.err} role="alert" data-testid="save-error">
        {saveError}
      </p>
    </div>
  );
}
