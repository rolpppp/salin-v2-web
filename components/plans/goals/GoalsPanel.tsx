"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card, CardTitle } from "@/components/card/Card";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { Field, Input, Select } from "@/components/field/Field";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import { InlineName } from "@/components/plans/rows/InlineName";
import styles from "@/components/plans/rows/plans.module.css";
import { useRun } from "@/components/plans/rows/useRun";
import { ProgressBar } from "@/components/progress-bar/ProgressBar";
import { addGoalAction, archiveGoalAction, restoreGoalAction, updateGoalAction } from "@/lib/actions/goals";
import { formatMoney } from "@/lib/data/balances";
import { minorToInput, type GoalView, type GoalsData } from "@/lib/data/goals";
import { formatPercent, parseMoney } from "@/lib/money";

const parseTarget = (raw: string) => {
  const r = parseMoney(raw);
  if (r.ok) return { ok: true as const, minor: r.minor };
  const msg: Record<string, string> = {
    empty: "Enter a target amount.",
    not_a_number: "Enter an amount like 50,000.",
    too_many_decimals: "Use at most 2 decimal places.",
    not_positive: "The target must be more than ₱0.",
    too_large: "That target is too large.",
  };
  return { ok: false as const, error: msg[r.error] ?? "Enter a valid amount." };
};

export function GoalsPanel({ data }: { data: GoalsData }) {
  const focusHeading = () => document.getElementById("goals-h")?.focus();
  return (
    <Card aria-labelledby="goals-h">
      <div className={styles.head}>
        <CardTitle id="goals-h" tabIndex={-1}>
          Goals
        </CardTitle>
        <span className={styles.muted}>Targets you&rsquo;re saving toward. The Emergency fund target is also your Plan B switch.</span>
      </div>
      {data.goals.length === 0 ? (
        <EmptyState title="No goals yet">A goal is something you&rsquo;re saving toward, like an emergency fund or a PC. Add one, then link it to the bucket that feeds it.</EmptyState>
      ) : (
        <ul className={styles.list} data-testid="goal-rows">
          {data.goals.map((g) => (
            <GoalRow key={`${g.id}:${g.name}:${g.targetMinor}:${g.linkedBucketId}:${g.linkedShareBp}`} goal={g} buckets={data.buckets} onArchived={focusHeading} />
          ))}
        </ul>
      )}
      <AddGoalForm buckets={data.buckets} />
      {data.archived.length > 0 ? (
        <div className={styles.foot}>
          <div className={styles.archived} data-testid="archived-goals">
            <span>Archived:</span>
            {data.archived.map((a) => (
              <ArchivedGoal key={a.id} id={a.id} name={a.name} onRestored={focusHeading} />
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function GoalRow({ goal: g, buckets, onArchived }: { goal: GoalView; buckets: { id: string; name: string }[]; onArchived: () => void }) {
  const target = useRun();
  const link = useRun();
  const archive = useRun();
  const [targetRaw, setTargetRaw] = useState(minorToInput(g.targetMinor));
  /** The target the server has now, so Enter followed by blur does not save twice. */
  const savedTarget = useRef(g.targetMinor);
  const [bucket, setBucket] = useState(g.linkedBucketId ?? "");
  const [sharePct, setSharePct] = useState(String(g.linkedShareBp / 100));

  async function saveTarget() {
    const parsed = parseTarget(targetRaw);
    if (!parsed.ok) {
      target.setError(parsed.error);
      return;
    }
    if (parsed.minor === savedTarget.current) {
      setTargetRaw(minorToInput(savedTarget.current));
      return;
    }
    const r = await target.run(
      () => updateGoalAction({ id: g.id, targetMinor: parsed.minor }),
      `${g.name} target is now ${formatMoney(parsed.minor, g.currency)}.${g.isPlanSwitch ? " Your Plan B switch uses the same amount." : ""}`,
    );
    if (r.ok) savedTarget.current = parsed.minor;
    else setTargetRaw(minorToInput(savedTarget.current));
  }

  async function saveLink(nextBucket: string, nextPct: string) {
    const pct = Number(nextPct);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      link.setError("Enter a whole percent from 0 to 100.");
      return;
    }
    const bucketId = nextBucket === "" ? null : nextBucket;
    const shareBp = pct * 100;
    if (bucketId === g.linkedBucketId && shareBp === g.linkedShareBp) return;
    const r = await link.run(() => updateGoalAction({ id: g.id, bucketId, shareBp }), `${g.name} is fed from ${bucketId ? (buckets.find((b) => b.id === bucketId)?.name ?? "that bucket") : "no bucket"}.`);
    if (!r.ok) {
      setBucket(g.linkedBucketId ?? "");
      setSharePct(String(g.linkedShareBp / 100));
    }
  }

  return (
    <li className={`${styles.row} ${styles.goalRow}`}>
      <div className={styles.stack}>
        <InlineName label={`Goal name for ${g.name}`} value={g.name} onCommit={(name) => updateGoalAction({ id: g.id, name })} saved={(n) => `Renamed to ${n}.`} />
        <small className={styles.small}>{g.feed}</small>
      </div>
      <div className={styles.bar}>
        <ProgressBar label={`${g.name} progress`} size="goal" tone="good" value={g.progressBp} max={10_000} valueText={`${formatPercent(g.progressBp)} of target`} />
      </div>
      <span className={styles.num} data-testid="goal-saved">
        {formatMoney(g.savedMinor, g.currency)} saved
        <small className={styles.small}>of {formatMoney(g.targetMinor, g.currency)}</small>
      </span>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveTarget();
        }}
        onBlur={() => void saveTarget()}
      >
        <MoneyInput
          label={<span className="sr">{`${g.name} target`}</span>}
          value={targetRaw}
          error={target.error}
          onValueChange={(raw) => {
            setTargetRaw(raw);
            if (target.error) target.setError(null);
          }}
          disabled={target.busy}
        />
      </form>
      <div className={styles.act}>
        {g.isPlanSwitch ? (
          <span className={styles.inUse}>
            Plan B switch<small className={styles.small}>Archive is off while it&rsquo;s the switch</small>
          </span>
        ) : (
          <Button
            variant="quiet"
            loading={archive.busy}
            loadingLabel="Archiving"
            aria-label={`Archive ${g.name}`}
            onClick={async () => {
              const r = await archive.run(() => archiveGoalAction({ id: g.id }), `${g.name} archived.`);
              if (r.ok) onArchived();
            }}
          >
            Archive
          </Button>
        )}
        <p role="alert" className={styles.err}>
          {archive.error}
        </p>
      </div>
      <div className={styles.inline} style={{ gridColumn: "1 / -1" }}>
        <Select
          aria-label={`Bucket feeding ${g.name}`}
          value={bucket}
          disabled={link.busy}
          onChange={(e) => {
            setBucket(e.target.value);
            void saveLink(e.target.value, sharePct);
          }}
          style={{ maxWidth: 260 }}
        >
          <option value="">Not linked to a bucket</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              Fed from {b.name}
            </option>
          ))}
        </Select>
        {bucket ? (
          <label className={styles.inline}>
            <span className={styles.muted}>Share of it</span>
            <Input
              aria-label={`Share of the bucket for ${g.name}, in percent`}
              inputMode="numeric"
              value={sharePct}
              disabled={link.busy}
              style={{ width: 84 }}
              onChange={(e) => {
                setSharePct(e.target.value);
                if (link.error) link.setError(null);
              }}
              onBlur={() => void saveLink(bucket, sharePct)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <span className={styles.muted}>%</span>
          </label>
        ) : null}
        <p role="alert" className={styles.err}>
          {link.error}
        </p>
      </div>
    </li>
  );
}

function ArchivedGoal({ id, name, onRestored }: { id: string; name: string; onRestored: () => void }) {
  const restore = useRun();
  return (
    <span className={styles.archivedItem}>
      {name}
      <Button
        variant="quiet"
        loading={restore.busy}
        loadingLabel="Restoring"
        aria-label={`Restore ${name}`}
        onClick={async () => {
          const r = await restore.run(() => restoreGoalAction({ id }), `${name} restored.`);
          if (r.ok) onRestored();
        }}
      >
        Restore
      </Button>
      <span role="alert" className={styles.err}>
        {restore.error}
      </span>
    </span>
  );
}

function AddGoalForm({ buckets }: { buckets: { id: string; name: string }[] }) {
  const add = useRun();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [targetRaw, setTargetRaw] = useState("");
  const [bucket, setBucket] = useState("");
  const [sharePct, setSharePct] = useState("100");
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className={styles.foot}>
        <div>
          <Button id="add-goal-toggle" onClick={() => setOpen(true)}>
            + Add a goal
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = parseTarget(targetRaw);
        if (!parsed.ok) {
          setFieldError(parsed.error);
          return;
        }
        const pct = Number(sharePct);
        if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
          setFieldError("Enter a whole percent from 0 to 100.");
          return;
        }
        setFieldError(null);
        const r = await add.run(
          () => addGoalAction({ name, targetMinor: parsed.minor, bucketId: bucket === "" ? null : bucket, shareBp: bucket === "" ? 10_000 : pct * 100 }),
          `${name.trim()} added.`,
        );
        if (r.ok) {
          setName("");
          setTargetRaw("");
          setBucket("");
          setSharePct("100");
          setOpen(false);
          requestAnimationFrame(() => document.getElementById("add-goal-toggle")?.focus());
        }
      }}
    >
      <Field label="Name" error={add.error}>
        {(c) => <Input {...c} autoFocus autoComplete="off" placeholder="e.g. New laptop" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <MoneyInput label="Target" value={targetRaw} onValueChange={setTargetRaw} error={fieldError} />
      <Field label="Fed from">
        {(c) => (
          <Select {...c} value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="">Not linked yet</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {bucket ? (
        <Field label="Share of that bucket (%)">
          {(c) => <Input {...c} inputMode="numeric" value={sharePct} onChange={(e) => setSharePct(e.target.value)} />}
        </Field>
      ) : null}
      <div className={styles.formBtns}>
        <Button type="submit" variant="primary" loading={add.busy} loadingLabel="Adding">
          Add goal
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setOpen(false);
            add.setError(null);
            setFieldError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
