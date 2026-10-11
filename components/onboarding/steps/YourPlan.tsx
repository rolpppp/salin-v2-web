"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { SegmentedControl } from "@/components/segmented-control/SegmentedControl";
import { formatPeso } from "@/lib/money/format";
import { PLAN_BUCKETS, safetyNetTarget } from "@/lib/money/suggest";
import type { PlanBucket } from "@/lib/money/suggest";
import {
  PLAN_TARGET_FIELD,
  PLAN_TOTAL_FIELD,
  PRESETS,
  monthlyOf,
  planBOffered,
  planOnEnter,
  planQuestion,
  planReason,
  planRefresh,
  planRows,
  realityChecks,
  setPercent,
  switchPreset,
  totalStatus,
  validatePlan,
} from "@/lib/onboarding/plan-step";
import type { StepBodyProps, StepModule } from "@/lib/onboarding/step";
import { StepPesoField } from "./fields";
import styles from "./steps.module.css";

function PctStepper({ id, name, pct, onChange, invalid }: { id: string; name: string; pct: number; onChange: (n: number) => void; invalid: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const step = (d: number) => onChange(Math.min(100, Math.max(0, pct + d)));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      setText(null);
      step(e.key === "ArrowUp" ? 1 : -1);
    }
  };
  return (
    <span className={styles.stepper}>
      <button type="button" className={styles.sb} aria-label={`Less to ${name}`} aria-disabled={pct <= 0 ? true : undefined} onClick={() => pct > 0 && step(-1)}>
        −
      </button>
      <label className="sr" htmlFor={id}>
        {name} percent
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={100}
        step={1}
        inputMode="numeric"
        value={text ?? String(pct)}
        aria-invalid={invalid ? true : undefined}
        onKeyDown={onKey}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (/^\d{1,3}$/.test(v)) onChange(Math.min(100, Number(v)));
          else if (v === "") onChange(0);
        }}
        onBlur={() => setText(null)}
      />
      <span className={styles.pc} aria-hidden="true">
        %
      </span>
      <button type="button" className={styles.sb} aria-label={`More to ${name}`} aria-disabled={pct >= 100 ? true : undefined} onClick={() => pct < 100 && step(1)}>
        +
      </button>
    </span>
  );
}

function YourPlanBody({ draft, ctx, update, errorField, announce }: StepBodyProps) {
  const [added, setAdded] = useState<PlanBucket[]>([]);
  const refreshed = useRef(false);

  // The silent refresh normally happens in `onEnter`. The "answers changed under your edits" case is applied here so it can be announced.
  useEffect(() => {
    if (refreshed.current) return;
    refreshed.current = true;
    const r = planRefresh(draft);
    if (!r) return;
    update(r.patch);
    if (r.announce) announce(r.announce);
  }, [draft, update, announce]);

  const plan = draft.planA;
  if (!plan) return <p className={styles.note}>Working out your plan…</p>;

  const rows = planRows(draft, ctx, plan);
  const shown = rows.filter((r) => r.pct > 0 || added.includes(r.key));
  const hidden = rows.filter((r) => !shown.includes(r));
  const status = totalStatus(plan);
  const checks = realityChecks(draft, ctx, plan);
  const offered = planBOffered(plan);
  const apply = (key: PlanBucket, n: number) => {
    // A row you've taken to 0% stays on screen (so you can type a new number); "Add a bucket" is for rows that started hidden.
    if (n <= 0) setAdded((a) => (a.includes(key) ? a : [...a, key]));
    const p = setPercent(draft, key, n);
    if (p) update(p);
  };
  const totalInvalid = errorField === PLAN_TOTAL_FIELD;

  return (
    <div className={styles.stack}>
      <SegmentedControl
        label="Start from"
        options={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
        value={draft.preset}
        onValueChange={(v) => {
          if (v === draft.preset) return;
          const s = switchPreset(draft, v);
          update(s.patch);
          announce(s.announce);
          setAdded([]);
        }}
      />

      <div className={styles.bar} aria-hidden="true">
        {PLAN_BUCKETS.filter((k) => plan[k] > 0).map((k) => (
          <span key={k} style={{ ["--c" as string]: `var(--b-${k})`, flexGrow: plan[k] }}>
            {plan[k] >= 8 ? `${plan[k]}%` : ""}
          </span>
        ))}
      </div>

      <ul className={styles.rows}>
        {shown.map((r) => (
          <li key={r.key} className={styles.prow} data-off={r.pct === 0 ? true : undefined} style={{ ["--c" as string]: `var(--b-${r.key})` }}>
            <span className={styles.pn}>
              <i aria-hidden="true" />
              <span>
                <b>{r.name}</b>
                <small>{r.purpose}</small>
              </span>
            </span>
            <PctStepper id={`plan-pct-${r.key}`} name={r.name} pct={r.pct} invalid={totalInvalid} onChange={(n) => apply(r.key, n)} />
            <span className={styles.pv}>
              {formatPeso(r.perPayMinor)}
              <small>{r.redirectUntil ? `to Emergency until ${r.redirectUntil}` : `≈ ${formatPeso(r.perMonthMinor)} a month`}</small>
            </span>
          </li>
        ))}
      </ul>

      {hidden.length ? (
        <div className={styles.more}>
          <span>Add a bucket:</span>
          {hidden.map((r) => (
            <button
              key={r.key}
              type="button"
              className={styles.addBtn}
              onClick={() => {
                setAdded((a) => [...a, r.key]);
                requestAnimationFrame(() => document.getElementById(`plan-pct-${r.key}`)?.focus());
              }}
            >
              + {r.name}
            </button>
          ))}
        </div>
      ) : null}

      <div id={PLAN_TOTAL_FIELD} tabIndex={-1} role="status" className={styles.total} data-ok={status.ok} data-invalid={totalInvalid ? true : undefined}>
        <span className={styles.mark} aria-hidden="true">
          {status.ok ? "✓" : "!"}
        </span>
        <span>{status.text}</span>
      </div>

      {checks.length ? (
        <ul className={styles.reality} aria-label="Compared with your spending">
          {checks.map((c) => (
            <li key={c.key} data-short={c.short}>
              <span className={styles.dot} style={{ ["--c" as string]: `var(--b-${c.bucket})` }} aria-hidden="true" />
              <span>
                <b>{c.lead}.</b> {c.text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {offered ? (
        <div className={styles.stack}>
          <label className={styles.toggle}>
            <input type="checkbox" id="plan-b-on" checked={draft.planBOn} onChange={(e) => update({ planBOn: e.target.checked })} />
            <span className={styles.sw} aria-hidden="true" />
            <span>
              <b>Switch to Plan B when your safety net is full</b>
              <small>Then Emergency drops to 5% and Investments get the other {plan.emergency - 5}%.</small>
            </span>
          </label>
          {draft.planBOn ? (
            <div className={styles.target}>
              <StepPesoField
                id={PLAN_TARGET_FIELD}
                label="Safety net target"
                hint="About three months of bills and living. It's also your Emergency fund goal."
                minor={draft.targetMinor}
                invalid={errorField === PLAN_TARGET_FIELD}
                onMinor={(m) => update({ targetMinor: m })}
                onBlur={() => {
                  if ((draft.targetMinor ?? 0) < 100_000) update({ targetMinor: safetyNetTarget(monthlyOf(draft), plan.living, plan.rent) });
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const planStep: StepModule = {
  id: "plan",
  label: "Your plan",
  question: planQuestion,
  reason: planReason,
  Body: YourPlanBody,
  validate: (draft) => validatePlan(draft),
  onEnter: (draft) => planOnEnter(draft),
  primaryLabel: () => "Use this plan",
};
