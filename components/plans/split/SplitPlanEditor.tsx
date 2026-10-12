"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/card/Card";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { SAVE_FAILED, type ActionResult } from "@/lib/actions/result";
import type { PlanBucket, PlanSettings, PlanView, SplitPlanData } from "@/lib/data/plans";
import { BucketsSection } from "./BucketsSection";
import { PlanBar } from "./PlanBar";
import { PlanEditor } from "./PlanEditor";
import { RulesCard } from "./RulesCard";
import { copyName, draftFromBp, draftToLines, orderPlanChips, scratchDraft, type PlanDraft } from "./logic";
import { defaultActions, type SplitActions } from "./actions";
import { percentToBp, parsePercent } from "../shared";
import styles from "./split.module.css";

export type { SplitActions } from "./actions";

type Props = {
  data: SplitPlanData;
  actions?: SplitActions;
  /** A typical pay in centavos, when the page has one; shows what each share comes to. */
  typicalPayMinor?: number | null;
};

const NEW = "new";

export function SplitPlanEditor({ data, actions = defaultActions, typicalPayMinor }: Props) {
  const announce = useAnnounce();
  const [plans, setPlans] = useState<PlanView[]>(data.plans);
  const [settings, setSettings] = useState<PlanSettings>(data.settings);
  const [buckets, setBuckets] = useState<PlanBucket[]>(data.buckets);
  const [archived, setArchived] = useState<PlanBucket[]>(data.archived);
  const [selected, setSelected] = useState<string>(data.settings.activeKey);
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({});
  const [scratch, setScratch] = useState<PlanDraft>({});
  const [focusNameKey, setFocusNameKey] = useState<string | null>(null);
  const [barError, setBarError] = useState<string | null>(null);
  const barErrRef = useRef<HTMLParagraphElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const chipFocus = useRef<string | null>(null);

  // Follow the server when it sends fresh data (another tab or device, or a refresh after an action).
  const sig = useMemo(() => JSON.stringify([data.plans, data.settings, data.buckets, data.archived]), [data]);
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setPlans(data.plans);
    setSettings(data.settings);
    setBuckets(data.buckets);
    setArchived(data.archived);
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => data.plans.some((p) => p.key === k))));
    if (selected !== NEW && !data.plans.some((p) => p.key === selected)) setSelected(data.settings.activeKey);
  }

  useEffect(() => {
    if (barError) barErrRef.current?.focus();
  }, [barError]);
  useEffect(() => {
    if (chipFocus.current) {
      barRef.current?.querySelector<HTMLElement>(`[data-plan-key="${chipFocus.current}"]`)?.focus();
      chipFocus.current = null;
    }
  });

  const planBuckets = useMemo(() => buckets.filter((b) => !b.planless), [buckets]);
  const ids = useMemo(() => planBuckets.map((b) => b.id), [planBuckets]);
  const savedDrafts = useMemo(() => Object.fromEntries(plans.map((p) => [p.key, draftFromBp(p.lines, ids)])), [plans, ids]);
  const chips = orderPlanChips(plans, settings.activeKey);

  const isNew = selected === NEW;
  const current = isNew ? null : (plans.find((p) => p.key === selected) ?? plans[0] ?? null);
  const draft: PlanDraft = isNew ? { ...scratchDraft(ids), ...scratch } : current ? { ...savedDrafts[current.key], ...drafts[current.key] } : {};

  function setDraftValue(bucketId: string, value: string) {
    if (isNew) setScratch((s) => ({ ...s, [bucketId]: value }));
    else if (current) setDrafts((d) => ({ ...d, [current.key]: { ...d[current.key], [bucketId]: value } }));
  }

  function addPlan(key: string, name: string, lines: Record<string, number>) {
    setPlans((ps) => (ps.some((p) => p.key === key) ? ps : [...ps, { key, name, lines }]));
    setSelected(key);
    setFocusNameKey(key);
  }

  async function copyPlan(sourceKey: string) {
    const source = plans.find((p) => p.key === sourceKey);
    if (!source) return;
    const name = copyName(
      source.name,
      plans.map((p) => p.name),
    );
    setBarError(null);
    let r: ActionResult<{ key: string }>;
    try {
      r = await actions.createPlan({ name, copyFrom: sourceKey });
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    if (!r.ok) {
      setBarError(r.error);
      announce(r.error);
      return;
    }
    addPlan(r.key, name, { ...source.lines });
    announce(`Created ${name} as a copy of ${source.name}. Its name is selected so you can rename it.`);
  }

  async function saveCurrent(name: string): Promise<ActionResult> {
    if (isNew) {
      const lines = draftToLines(draft, ids);
      let r: ActionResult<{ key: string }>;
      try {
        r = await actions.createPlan({ name, lines });
      } catch {
        r = { ok: false, error: SAVE_FAILED };
      }
      if (!r.ok) return r;
      addPlan(r.key, name, Object.fromEntries(lines.map((l) => [l.bucketId, l.percentBp])));
      setScratch({});
      announce(`${name} created. It splits paydays only when you choose it below.`);
      return { ok: true };
    }
    if (!current) return { ok: false, error: SAVE_FAILED };
    const key = current.key;
    let r: ActionResult;
    try {
      r = await actions.savePlan(key, draftToLines(draft, ids));
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    if (!r.ok) {
      announce(r.error);
      return { ok: false, error: `${r.error} Your last saved ${current.name} is still used.` };
    }
    const lines = Object.fromEntries(ids.map((id) => [id, percentToBp(parsePercent(draft[id] ?? "") ?? 0)]));
    setPlans((ps) => ps.map((p) => (p.key === key ? { ...p, lines } : p)));
    setDrafts((d) => {
      const { [key]: _gone, ...rest } = d;
      void _gone;
      return rest;
    });
    announce(`${current.name} saved. It applies to paydays from now on; past paydays stay as they were.`);
    return { ok: true };
  }

  async function renameCurrent(name: string): Promise<ActionResult> {
    if (!current) return { ok: false, error: SAVE_FAILED };
    const r = await actions.renamePlan(current.key, name);
    if (r.ok) {
      setPlans((ps) => ps.map((p) => (p.key === current.key ? { ...p, name } : p)));
      announce(`Renamed to ${name}.`);
    } else announce(r.error);
    return r;
  }

  async function deleteCurrent(): Promise<ActionResult> {
    if (!current) return { ok: false, error: SAVE_FAILED };
    const key = current.key;
    const r = await actions.deletePlan(key);
    if (!r.ok) {
      announce(r.error);
      return r;
    }
    const rest = plans.filter((p) => p.key !== key);
    const next = rest.find((p) => p.key === settings.activeKey)?.key ?? rest[0]?.key ?? settings.activeKey;
    setPlans(rest);
    setSelected(next);
    setFocusNameKey(null);
    chipFocus.current = next;
    announce(`${current.name} deleted. Paydays already confirmed keep their history.`);
    return r;
  }

  const takenNames = plans.filter((p) => p.key !== current?.key).map((p) => p.name);
  const plansForPick = plans.map((p) => ({ key: p.key, name: p.name }));

  return (
    <div className={styles.stack}>
      <Card aria-labelledby="split-h">
        <div className={styles.head}>
          <h2 id="split-h" className={styles.h2}>
            How each payday is split
          </h2>
        </div>
        <div ref={barRef}>
          <PlanBar
            chips={chips}
            selectedKey={isNew ? null : (current?.key ?? null)}
            onSelect={(k) => {
              setSelected(k);
              setFocusNameKey(null);
              setBarError(null);
            }}
            onScratch={() => {
              setScratch(scratchDraft(ids));
              setSelected(NEW);
              setBarError(null);
            }}
            onCopy={(k) => void copyPlan(k)}
          />
        </div>
        <p ref={barErrRef} tabIndex={-1} className={styles.err} role="alert" data-testid="plan-bar-error">
          {barError}
        </p>

        {isNew || current ? (
          <PlanEditor
            key={isNew ? NEW : (current as PlanView).key}
            mode={isNew ? { kind: "new" } : { kind: "existing", planKey: (current as PlanView).key, name: (current as PlanView).name, isActive: (current as PlanView).key === settings.activeKey }}
            buckets={planBuckets}
            draft={draft}
            saved={isNew || !current ? null : savedDrafts[current.key]}
            onDraft={setDraftValue}
            compareOptions={plans.filter((p) => p.key !== current?.key)}
            takenNames={takenNames}
            typicalPayMinor={typicalPayMinor}
            focusName={!isNew && focusNameKey === current?.key}
            onRename={renameCurrent}
            onDelete={deleteCurrent}
            onSave={saveCurrent}
          />
        ) : null}
      </Card>

      <RulesCard
        key={plans.map((p) => p.key).join("|")}
        settings={settings}
        plans={plansForPick}
        redirectRule={data.redirectRule}
        setTarget={actions.setTarget}
        setActivePlan={actions.setActivePlan}
        onSaved={(s) => setSettings((cur) => ({ ...cur, ...s }))}
      />

      <BucketsSection
        buckets={buckets}
        archived={archived}
        accounts={data.accounts}
        actions={actions}
        onAdded={(b) => setBuckets((bs) => [...bs, b])}
        onEdited={(id, patch) => setBuckets((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))}
        onArchived={(id) => {
          const b = buckets.find((x) => x.id === id);
          setBuckets((bs) => bs.filter((x) => x.id !== id));
          if (b) setArchived((a) => [...a, b]);
        }}
        onRestored={(id) => {
          const b = archived.find((x) => x.id === id);
          setArchived((a) => a.filter((x) => x.id !== id));
          if (b) setBuckets((bs) => [...bs, b]);
        }}
      />
    </div>
  );
}
