"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Field, Input, Select } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import type { ActionResult } from "@/lib/actions/result";
import { SAVE_FAILED } from "@/lib/actions/result";
import { CUSTOM_HUES } from "@/lib/data/hues";
import type { BucketGroupKey, PlanAccount, PlanBucket } from "@/lib/data/plans";
import { hueColor } from "../shared";
import { HuePicker } from "./HuePicker";
import { GROUP_LABELS, afterReasonCheck, nameProblem, type ArchiveState } from "./logic";
import type { SplitActions } from "./actions";
import styles from "./split.module.css";

export const MAX_PLAN_BUCKETS = 20;

type Props = {
  buckets: PlanBucket[];
  archived: PlanBucket[];
  accounts: PlanAccount[];
  actions: SplitActions;
  onAdded: (b: PlanBucket) => void;
  onEdited: (id: string, patch: Partial<PlanBucket>) => void;
  onArchived: (id: string) => void;
  onRestored: (id: string) => void;
};

const GROUPS: BucketGroupKey[] = ["spend", "save", "set_aside"];

function GroupRadios({ value, onChange, name }: { value: BucketGroupKey; onChange: (g: BucketGroupKey) => void; name: string }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Group</legend>
      <div className={styles.radios}>
        {GROUPS.map((g) => (
          <label key={g} className={styles.radio}>
            <input type="radio" name={name} value={g} checked={value === g} onChange={() => onChange(g)} />
            {GROUP_LABELS[g]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function BucketsSection({ buckets, archived, accounts, actions, onAdded, onEdited, onArchived, onRestored }: Props) {
  const announce = useAnnounce();
  const liveAccounts = accounts.filter((a) => !a.isArchived);
  const planCount = buckets.filter((b) => !b.planless).length;
  const atLimit = planCount >= MAX_PLAN_BUCKETS;

  // ---- add
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<BucketGroupKey>("spend");
  const [hue, setHue] = useState<string>(() => firstFreeHue(buckets));
  const [keptIn, setKeptIn] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const addBtn = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const addErr = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (adding) nameInput.current?.focus();
  }, [adding]);
  useEffect(() => {
    if (addError) addErr.current?.focus();
  }, [addError]);

  async function add() {
    const problem = nameProblem(
      name,
      buckets.map((b) => b.name),
    );
    if (problem) {
      setAddError(problem.replace("one with that name", "a bucket with that name"));
      return;
    }
    setAddBusy(true);
    setAddError(null);
    let r: ActionResult<{ id: string }>;
    try {
      r = await actions.createBucket({ name: name.trim(), group, hue, keptIn: keptIn || null });
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    setAddBusy(false);
    if (!r.ok) {
      setAddError(r.error);
      announce(r.error);
      return;
    }
    onAdded({ id: r.id, name: name.trim(), shortName: name.trim(), hue, groupKey: group, note: null, planless: false, keptInAccountId: keptIn || null, isBuiltin: false });
    announce(`${name.trim()} added at 0% in every plan. Give it a share in a plan to start using it.`);
    setName("");
    setKeptIn("");
    setGroup("spend");
    setAdding(false);
    addBtn.current?.focus();
  }

  return (
    <Card aria-labelledby="buckets-h">
      <div className={styles.head}>
        <h2 id="buckets-h" className={styles.h2}>
          Buckets
        </h2>
        <Button ref={addBtn} variant="soft" onClick={() => setAdding((a) => !a)} aria-expanded={adding} disabled={atLimit && !adding} aria-describedby={atLimit ? "bucket-limit" : undefined}>
          Add a bucket
        </Button>
      </div>
      {atLimit ? (
        <p id="bucket-limit" className={styles.hint}>
          You have {MAX_PLAN_BUCKETS} buckets in your plans, the most there can be. Archive one to add another.
        </p>
      ) : null}

      {adding ? (
        <form
          className={styles.addForm}
          aria-label="Add a bucket"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Field label="Name">
            {(c) => <Input {...c} ref={nameInput} value={name} maxLength={40} autoComplete="off" placeholder="For example, Japan trip" onChange={(e) => setName(e.target.value)} />}
          </Field>
          <GroupRadios value={group} onChange={setGroup} name="new-bucket-group" />
          <HuePicker value={hue} onChange={setHue} />
          <Field label="Kept in" hint="You can choose later, but a payday can only go into this bucket once it is kept somewhere.">
            {(c) => (
              <Select {...c} value={keptIn} onChange={(e) => setKeptIn(e.target.value)}>
                <option value="">Choose later</option>
                {liveAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p ref={addErr} tabIndex={-1} className={styles.err} role="alert" data-testid="add-bucket-error">
            {addError}
          </p>
          <div className={styles.actions}>
            <Button variant="primary" type="submit" loading={addBusy} loadingLabel="Adding">
              Add bucket
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setAdding(false);
                setAddError(null);
                addBtn.current?.focus();
              }}
            >
              Cancel
            </Button>
          </div>
          <p className={styles.hint}>A new bucket starts at 0% in every plan, so nothing changes until you give it a share.</p>
        </form>
      ) : null}

      <ul className={styles.bucketList}>
        {buckets.map((b) => (
          <BucketRow key={b.id} bucket={b} accounts={accounts} actions={actions} onEdited={onEdited} onArchived={onArchived} />
        ))}
      </ul>

      {archived.length > 0 ? (
        <details className={styles.archived}>
          <summary>Archived ({archived.length})</summary>
          <ul className={styles.bucketList}>
            {archived.map((b) => (
              <ArchivedRow key={b.id} bucket={b} actions={actions} onRestored={onRestored} />
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function firstFreeHue(buckets: PlanBucket[]): string {
  const used = new Set(buckets.map((b) => b.hue));
  return CUSTOM_HUES.find((h) => !used.has(h)) ?? CUSTOM_HUES[0];
}

function ArchivedRow({ bucket, actions, onRestored }: { bucket: PlanBucket; actions: SplitActions; onRestored: (id: string) => void }) {
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function restore() {
    setBusy(true);
    setError(null);
    let r: ActionResult;
    try {
      r = await actions.restoreBucket(bucket.id);
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    setBusy(false);
    if (r.ok) {
      onRestored(bucket.id);
      announce(`${bucket.name} restored at 0% in every plan.`);
    } else {
      setError(r.error);
      announce(r.error);
    }
  }
  return (
    <li className={styles.bucketRow} style={{ "--c": hueColor(bucket.hue) } as CSSProperties}>
      <span className={styles.bucket}>
        <i aria-hidden="true" />
        {bucket.name}
      </span>
      <Button variant="soft" onClick={() => void restore()} loading={busy} loadingLabel="Restoring" aria-label={`Restore ${bucket.name}`}>
        Restore
      </Button>
      <p className={styles.err} role="alert">
        {error}
      </p>
    </li>
  );
}

function BucketRow({ bucket: b, accounts, actions, onEdited, onArchived }: { bucket: PlanBucket; accounts: PlanAccount[]; actions: SplitActions; onEdited: Props["onEdited"]; onArchived: Props["onArchived"] }) {
  const announce = useAnnounce();
  const [editing, setEditing] = useState(false);
  const [kept, setKept] = useState(b.keptInAccountId);
  const [keptError, setKeptError] = useState<string | null>(null);
  const [archive, setArchive] = useState<ArchiveState>({ kind: "idle" });
  const archiveMsg = useRef<HTMLParagraphElement>(null);
  const editBtn = useRef<HTMLButtonElement>(null);

  // edit draft
  const [name, setName] = useState(b.name);
  const [shortName, setShortName] = useState(b.shortName);
  const [group, setGroup] = useState<BucketGroupKey>(b.groupKey);
  const [hue, setHue] = useState(b.hue ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const editErr = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (archive.kind === "blocked" || archive.kind === "failed") archiveMsg.current?.focus();
  }, [archive]);
  useEffect(() => {
    if (editError) editErr.current?.focus();
  }, [editError]);

  const options = accounts.filter((a) => !a.isArchived || a.id === kept);

  async function changeKeptIn(accountId: string) {
    const previous = kept;
    if (accountId === previous) return;
    setKept(accountId);
    setKeptError(null);
    let r: ActionResult;
    try {
      r = await actions.setKeptIn(b.id, accountId);
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    if (r.ok) {
      const acct = accounts.find((a) => a.id === accountId)?.name ?? "that account";
      onEdited(b.id, { keptInAccountId: accountId });
      announce(`${b.name} is now kept in ${acct}. It applies to paydays from now on.`);
    } else {
      setKept(previous);
      setKeptError(r.error);
      announce(r.error);
    }
  }

  async function saveEdit() {
    const problem = nameProblem(name, []);
    if (problem) {
      setEditError(problem);
      return;
    }
    setEditBusy(true);
    setEditError(null);
    let r: ActionResult;
    try {
      r = await actions.updateBucket({ id: b.id, name: name.trim(), shortName: shortName.trim(), group, hue });
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    setEditBusy(false);
    if (r.ok) {
      onEdited(b.id, { name: name.trim(), shortName: shortName.trim() || name.trim(), groupKey: group, hue });
      announce(`${name.trim()} saved.`);
      setEditing(false);
      editBtn.current?.focus();
    } else {
      setEditError(r.error);
      announce(r.error);
    }
  }

  async function startArchive() {
    setArchive({ kind: "checking" });
    let first: Awaited<ReturnType<SplitActions["archiveReason"]>>;
    try {
      first = await actions.archiveReason(b.id);
    } catch {
      first = { ok: false, error: SAVE_FAILED };
    }
    const { next, archive: go } = afterReasonCheck(first);
    setArchive(next);
    if (!go) {
      if (next.kind === "blocked") announce(`${b.name} can't be archived yet. ${next.reason}`);
      return;
    }
    let r: ActionResult;
    try {
      r = await actions.archiveBucket(b.id);
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    if (r.ok) {
      onArchived(b.id);
      announce(`${b.name} archived. You can restore it from Archived.`);
    } else {
      setArchive({ kind: "failed", error: r.error });
    }
  }

  return (
    <li className={styles.bucketRow} style={{ "--c": hueColor(b.hue) } as CSSProperties} data-bucket-id={b.id}>
      <div className={styles.bucketTop}>
        <span className={styles.bucket}>
          <i aria-hidden="true" />
          <span>
            {b.name}
            <span className={styles.group}>
              {GROUP_LABELS[b.groupKey]}
              {b.planless ? " · not part of the split" : ""}
            </span>
          </span>
        </span>
        <Select aria-label={`${b.name} is kept in`} className={styles.mini} value={kept ?? ""} onChange={(e) => void changeKeptIn(e.target.value)}>
          {kept === null || !options.some((a) => a.id === kept) ? (
            <option value="" disabled>
              Choose an account
            </option>
          ) : null}
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <span className={styles.rowActions}>
          <Button ref={editBtn} variant="quiet" onClick={() => setEditing((e) => !e)} aria-expanded={editing} aria-label={`Edit ${b.name}`}>
            Edit
          </Button>
          <Button variant="quiet" onClick={() => void startArchive()} loading={archive.kind === "checking"} loadingLabel="Checking" aria-label={`Archive ${b.name}`}>
            Archive
          </Button>
        </span>
      </div>
      <p className={styles.err} role="alert">
        {keptError}
      </p>
      {archive.kind === "blocked" || archive.kind === "failed" ? (
        <p ref={archiveMsg} tabIndex={-1} className={styles.reason} role="alert" data-testid="archive-reason">
          {archive.kind === "blocked" ? archive.reason : archive.error}
        </p>
      ) : null}

      {editing ? (
        <form
          className={styles.addForm}
          aria-label={`Edit ${b.name}`}
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          <Field label="Name">{(c) => <Input {...c} value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Short name" hint="Shown where space is tight.">
            {(c) => <Input {...c} value={shortName} maxLength={20} autoComplete="off" onChange={(e) => setShortName(e.target.value)} />}
          </Field>
          <GroupRadios value={group} onChange={setGroup} name={`group-${b.id}`} />
          <HuePicker value={b.isBuiltin ? "" : hue} onChange={setHue} disabled={b.isBuiltin} hint={b.isBuiltin ? "Built-in buckets keep their colour." : undefined} />
          <p ref={editErr} tabIndex={-1} className={styles.err} role="alert">
            {editError}
          </p>
          <div className={styles.actions}>
            <Button variant="primary" type="submit" loading={editBusy} loadingLabel="Saving">
              Save changes
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setEditing(false);
                setName(b.name);
                setShortName(b.shortName);
                setGroup(b.groupKey);
                setHue(b.hue ?? "");
                setEditError(null);
                editBtn.current?.focus();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
