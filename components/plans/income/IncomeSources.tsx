"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Chip } from "@/components/chip/Chip";
import { Input, Select } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import {
  addIncomeSource,
  removeIncomeSource,
  renameIncomeSource,
  saveIncomeSourceSplit,
  setIncomeSourceArchived,
  setIncomeSourceLandsIn,
  setIncomeSourceRule,
} from "@/lib/actions/income-sources";
import { SAVE_FAILED, type ActionResult } from "@/lib/actions/result";
import { INCOME_KINDS, RULE_OPTIONS, kindLabel, type IncomeRule } from "@/lib/data/income-kinds";
import type { IncomeSourcesData, SourceView } from "@/lib/data/income-sources";
import { hueColor } from "../shared";
import { checkOwnSplit, defaultWholeBucket, ownDiffers, ownDraftFromBp, ownDraftToLines, ownProblem, ownTotalLabel, ruleDescription, type SplitDraft } from "./logic";
import styles from "./income.module.css";

export type IncomeActions = {
  add: (kind: string) => Promise<ActionResult<{ id: string; name: string }>>;
  rename: (id: string, name: string) => Promise<ActionResult>;
  setRule: (id: string, rule: string, wholeBucketId?: string) => Promise<ActionResult>;
  saveSplit: (id: string, lines: Array<{ bucketId: string; percentBp: number }>) => Promise<ActionResult>;
  setLandsIn: (id: string, accountId: string) => Promise<ActionResult>;
  setArchived: (id: string, archived: boolean) => Promise<ActionResult>;
  remove: (id: string) => Promise<ActionResult>;
};
const defaultActions: IncomeActions = {
  add: addIncomeSource,
  rename: renameIncomeSource,
  setRule: setIncomeSourceRule,
  saveSplit: saveIncomeSourceSplit,
  setLandsIn: setIncomeSourceLandsIn,
  setArchived: setIncomeSourceArchived,
  remove: removeIncomeSource,
};

type Local = { rule?: IncomeRule; wholeBucketId?: string | null; landsInAccountId?: string | null; name?: string };
const kindColor = (kind: string) => hueColor(INCOME_KINDS.find((k) => k.kind === kind)?.hue);

async function attempt<T extends ActionResult<object>>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

type RowProps = {
  source: SourceView;
  local: Local;
  data: IncomeSourcesData;
  actions: IncomeActions;
  patch: (id: string, p: Local) => void;
  onRemoved: (name: string) => void;
};

function SourceRow({ source, local, data, actions, patch, onRemoved }: RowProps) {
  const announce = useAnnounce();
  const rule = local.rule ?? source.rule;
  const wholeBucketId = local.wholeBucketId !== undefined ? local.wholeBucketId : source.wholeBucketId;
  const landsIn = local.landsInAccountId !== undefined ? local.landsInAccountId : source.landsInAccountId;
  const savedName = local.name ?? source.name;
  const bucketIds = data.buckets.map((b) => b.id);

  const [nameDraft, setNameDraft] = useState(savedName);
  const [savedSplit, setSavedSplit] = useState<SplitDraft>(() => ownDraftFromBp(source.split, bucketIds));
  const [splitDraft, setSplitDraft] = useState<SplitDraft>(savedSplit);
  const [error, setError] = useState<string | null>(null);

  const check = checkOwnSplit(splitDraft, bucketIds);
  const problem = ownProblem(check, check.invalid[0] ? data.buckets.find((b) => b.id === check.invalid[0])?.name : undefined);
  const wholeName = data.buckets.find((b) => b.id === wholeBucketId)?.name ?? null;

  async function commitName() {
    const next = nameDraft.trim();
    if (next === savedName) {
      setNameDraft(savedName);
      return;
    }
    if (next === "") {
      setError("Give the source a name.");
      return;
    }
    if (next.length > 60) {
      setError("Keep the name to 60 characters or fewer.");
      return;
    }
    setError(null);
    const r = await attempt(() => actions.rename(source.id, next));
    if (r.ok) {
      patch(source.id, { name: next });
      setNameDraft(next);
      announce(`Renamed to ${next}.`);
    } else {
      setNameDraft(savedName);
      setError(r.error);
      announce(r.error);
    }
  }

  async function changeRule(next: IncomeRule, bucketId?: string | null) {
    setError(null);
    let bucket = bucketId ?? wholeBucketId;
    if (next === "whole" && !bucket) bucket = defaultWholeBucket(source.kind, data.buckets);
    if (next === "whole" && !bucket) {
      setError("Add a bucket first, then keep this source's money whole in it.");
      return;
    }
    const before = { rule, wholeBucketId };
    patch(source.id, { rule: next, wholeBucketId: next === "whole" ? bucket : null });
    const r = await attempt(() => actions.setRule(source.id, next, next === "whole" ? (bucket ?? undefined) : undefined));
    if (r.ok) {
      const label = RULE_OPTIONS.find((o) => o.value === next)?.label ?? next;
      announce(`${savedName}: ${label}. It applies to money that hasn't been given a job yet.`);
    } else {
      patch(source.id, before);
      setError(r.error);
      announce(r.error);
    }
  }

  async function changeLandsIn(accountId: string) {
    const before = landsIn;
    setError(null);
    patch(source.id, { landsInAccountId: accountId });
    const r = await attempt(() => actions.setLandsIn(source.id, accountId));
    if (r.ok) announce(`${savedName} now lands in ${data.accounts.find((a) => a.id === accountId)?.name ?? "that account"}.`);
    else {
      patch(source.id, { landsInAccountId: before });
      setError(r.error);
      announce(r.error);
    }
  }

  async function commitSplit() {
    if (!ownDiffers(splitDraft, savedSplit, bucketIds)) return;
    if (!check.savable) {
      announce(`${problem ?? "The split can't be saved."} Not saved.`);
      return;
    }
    setError(null);
    const snapshot = splitDraft;
    const r = await attempt(() => actions.saveSplit(source.id, ownDraftToLines(snapshot, bucketIds)));
    if (r.ok) {
      setSavedSplit(snapshot);
      announce(
        check.complete
          ? `${savedName}'s own split saved and adds up to 100%.`
          : `${savedName}'s own split saved. It adds up to ${check.total}%, so incomes from it need a job until it reaches 100%.`,
      );
    } else {
      setSplitDraft(savedSplit);
      setError(r.error);
      announce(r.error);
    }
  }

  async function archive() {
    const r = await attempt(() => actions.setArchived(source.id, true));
    if (r.ok) announce(`${savedName} archived. Its past income stays as it was.`);
    else {
      setError(r.error);
      announce(r.error);
    }
  }

  async function remove() {
    const r = await attempt(() => actions.remove(source.id));
    if (r.ok) onRemoved(savedName);
    else {
      setError(r.error);
      announce(r.error);
    }
  }

  const showKindChip = !savedName.toLowerCase().startsWith(kindLabel(source.kind).toLowerCase());
  const landsOptions = data.accounts;

  return (
    <li className={styles.row} style={{ "--c": kindColor(source.kind) } as CSSProperties} data-testid={`source-${source.id}`}>
      <div className={styles.nameCell}>
        <span className={styles.dot} aria-hidden="true" />
        <div className={styles.nameStack}>
          {source.hasIncome ? (
            <b className={styles.name}>{savedName}</b>
          ) : (
            <Input
              id={`name-${source.id}`}
              className={styles.nameInput}
              aria-label={`Name of ${savedName}`}
              aria-invalid={error && nameDraft.trim() === "" ? true : undefined}
              autoComplete="off"
              maxLength={80}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitName();
                }
              }}
            />
          )}
          <div className={styles.meta}>
            {showKindChip ? (
              <Chip tone="neutral" dot={false}>
                {kindLabel(source.kind)}
              </Chip>
            ) : null}
            <span id={`lands-label-${source.id}`}>lands in</span>
            <Select
              className={styles.metaSelect}
              aria-label={`${savedName} lands in`}
              value={landsIn ?? ""}
              onChange={(e) => void changeLandsIn(e.target.value)}
            >
              {landsIn === null || !landsOptions.some((a) => a.id === landsIn) ? (
                <option value="" disabled>
                  Choose an account
                </option>
              ) : null}
              {landsOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className={styles.ruleCell}>
        <Select aria-label={`Rule for ${savedName}`} value={rule} onChange={(e) => void changeRule(e.target.value as IncomeRule)}>
          {RULE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {rule === "whole" ? (
          <Select aria-label={`Bucket for ${savedName}`} value={wholeBucketId ?? ""} onChange={(e) => void changeRule("whole", e.target.value)}>
            {data.buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <div className={styles.says}>
        <p>{ruleDescription({ rule, activePlan: data.activePlan, wholeBucketName: wholeName, ownTotal: check.total })}</p>
        <div className={styles.actions} style={{ marginTop: 8 }}>
          {source.hasIncome ? (
            <Button variant="quiet" aria-label={`Archive ${savedName}`} onClick={() => void archive()}>
              Archive
            </Button>
          ) : (
            <Button variant="quiet" aria-label={`Remove ${savedName}`} onClick={() => void remove()}>
              Remove
            </Button>
          )}
        </div>
      </div>

      {rule === "own" ? (
        <div className={styles.own} role="group" aria-label={`Own split for ${savedName}`}>
          <span>Split this source&rsquo;s money. Leave a bucket at 0 to skip it.</span>
          <div className={styles.ownGrid}>
            {data.buckets.map((b) => {
              const n = splitDraft[b.id] ?? "0";
              const off = n.trim() === "" || n.trim() === "0";
              return (
                <label key={b.id} className={`${styles.ownField} ${off ? styles.off : ""}`} style={{ "--c": hueColor(b.hue) } as CSSProperties}>
                  <i aria-hidden="true" />
                  <span>{b.shortName}</span>
                  <Input
                    className={styles.ownInput}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`${b.name} percent for ${savedName}`}
                    aria-invalid={check.invalid.includes(b.id) ? true : undefined}
                    value={n}
                    onChange={(e) => setSplitDraft((d) => ({ ...d, [b.id]: e.target.value }))}
                    onBlur={() => void commitSplit()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitSplit();
                      }
                    }}
                  />
                  <span aria-hidden="true">%</span>
                </label>
              );
            })}
          </div>
          <span className={check.complete ? styles.totalOk : styles.totalBad} data-testid={`own-total-${source.id}`}>
            {ownTotalLabel(check.total)}
          </span>
          {problem ? <span className={styles.err}>{problem} Not saved yet: your last saved split is still used.</span> : null}
        </div>
      ) : null}

      <p className={styles.err} role="alert">
        {error}
      </p>
    </li>
  );
}

type Props = { data: IncomeSourcesData; actions?: IncomeActions };

export function IncomeSources({ data, actions = defaultActions }: Props) {
  const announce = useAnnounce();
  const [local, setLocal] = useState<Record<string, Local>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const focusId = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const addArea = useRef<HTMLDivElement>(null);
  const [archivedError, setArchivedError] = useState<string | null>(null);

  const live = data.sources.filter((s) => !s.isArchived);
  const archived = data.sources.filter((s) => s.isArchived);
  const patch = (id: string, p: Local) => setLocal((l) => ({ ...l, [id]: { ...l[id], ...p } }));

  // After adding, move focus to the new source's name once it has rendered.
  useEffect(() => {
    if (!focusId.current) return;
    const el = document.getElementById(`name-${focusId.current}`);
    if (el) {
      el.focus();
      (el as HTMLInputElement).select?.();
      focusId.current = null;
    }
  }, [data.sources, focusTick]);

  async function add(kind: string) {
    setAdding(true);
    setAddError(null);
    const r = await attempt(() => actions.add(kind));
    setAdding(false);
    if (r.ok) {
      setAddOpen(false);
      focusId.current = r.id;
      setFocusTick((n) => n + 1);
      // The new row arrives with the refreshed server data; the effect above focuses it then.
      setAddOpen(false);
      announce(`${r.name} added. Give it a name and choose how its money is split.`);
    } else {
      setAddError(r.error);
      announce(r.error);
    }
  }

  async function restore(s: SourceView) {
    setArchivedError(null);
    const r = await attempt(() => actions.setArchived(s.id, false));
    if (r.ok) announce(`${s.name} restored.`);
    else {
      setArchivedError(r.error);
      announce(r.error);
    }
  }

  const empty = live.length === 0;
  const showPresets = addOpen || empty;

  return (
    <Card aria-labelledby="src-h">
      <div className={styles.head}>
        <h2 id="src-h" className={styles.h2}>
          Income sources
        </h2>
        <span className={styles.sub}>Each source has a rule, so new money already knows its job.</span>
      </div>

      {empty ? (
        <p className={styles.sub} style={{ marginBottom: 12 }}>
          No income sources yet. Pick the kind of income you get below, such as salary or a side hustle, then choose its rule.
        </p>
      ) : (
        <ul className={styles.list} data-testid="source-list">
          {live.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              local={local[s.id] ?? {}}
              data={data}
              actions={actions}
              patch={patch}
              onRemoved={(name) => {
                announce(`${name} removed.`);
                requestAnimationFrame(() => addArea.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus());
              }}
            />
          ))}
        </ul>
      )}

      <div className={styles.add} ref={addArea}>
        {showPresets ? (
          <>
            <span className={styles.sub}>What kind of income?</span>
            <div className={styles.presets} role="group" aria-label="Income kinds">
              {INCOME_KINDS.map((k) => (
                <button key={k.kind} type="button" className={styles.preset} style={{ "--c": hueColor(k.hue) } as CSSProperties} disabled={adding} onClick={() => void add(k.kind)}>
                  <i aria-hidden="true" />
                  {k.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <Button variant="soft" onClick={() => setAddOpen(true)} data-testid="add-source">
            + Add income source
          </Button>
        )}
        <p className={styles.err} role="alert">
          {addError}
        </p>
      </div>

      {archived.length > 0 ? (
        <p className={styles.archived}>
          Archived:
          {archived.map((s) => (
            <span key={s.id}>
              {s.name}{" "}
              <Button variant="quiet" aria-label={`Restore ${s.name}`} onClick={() => void restore(s)}>
                Restore
              </Button>
            </span>
          ))}
          <span className={styles.err} role="alert">
            {archivedError}
          </span>
        </p>
      ) : null}

      <p className={styles.foot}>
        A rule change applies to money that hasn&rsquo;t been given a job yet. Side hustles start with 10% for tax because freelance income is taxable.
      </p>
    </Card>
  );
}
