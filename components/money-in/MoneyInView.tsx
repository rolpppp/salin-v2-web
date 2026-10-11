"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { CheckIcon } from "@/components/icons";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { PageHeader } from "@/components/page-header/PageHeader";
import { confirmIncomesAction } from "@/lib/actions/money-in";
import {
  buildDoneSlip,
  buildSlip,
  computePreviews,
  confirmAllLabel,
  headerCopy,
  initialChoice,
  moneyInPhase,
  needsHelper,
  sortQueue,
  storedJob,
  summarizeQueue,
  type Choice,
  type MoneyInData,
} from "@/lib/data/money-in-model";
import { formatPeso } from "@/lib/money";
import { AddIncomeForm } from "./AddIncomeForm";
import { IncomeSlip } from "./IncomeSlip";
import styles from "./money-in.module.css";
import { MoveMoneyStep, MOVE_MONEY_FOCUS_ID } from "./MoveMoneyStep";
import { QueueRow } from "./QueueRow";
import { StepHead } from "./StepHead";

type PendingFocus = { ready: (d: MoneyInData) => boolean; find: () => HTMLElement | null };

export type MoneyInViewProps = {
  data: MoneyInData;
  /** `/money-in?add=1` (Today's "+ Add income") opens the form with focus in Amount. */
  initialAddOpen?: boolean;
  /** Server time, so the render stays pure. */
  nowMs: number;
};

export function MoneyInView({ data, initialAddOpen = false, nowMs }: MoneyInViewProps) {
  const announce = useAnnounce();
  const [addOpen, setAddOpen] = useState(initialAddOpen);
  /** undefined = default row (first one needing a job, else the first); null = nothing open (slip shows the total). */
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);
  const addButtonRef = useRef<HTMLDivElement>(null);

  const queue = useMemo(() => sortQueue(data.incomes), [data.incomes]);
  const previews = useMemo(() => computePreviews(data, choices), [data, choices]);
  const summary = useMemo(() => summarizeQueue(data, previews), [data, previews]);
  const phase = moneyInPhase(data, nowMs);
  const copy = headerCopy(phase, queue.length);

  const defaultId = (queue.find((i) => previews.get(i.id)?.kind !== "ready") ?? queue[0])?.id ?? null;
  const openId = selected === null ? null : selected && queue.some((i) => i.id === selected) ? selected : defaultId;

  const slip = useMemo(() => (phase === "waiting" ? buildSlip(data, previews, openId) : buildDoneSlip(data.done)), [phase, data, previews, openId]);

  // Moves focus once the data it depends on has arrived (a row that exists, a row that is gone).
  useEffect(() => {
    const f = pendingFocus.current;
    if (!f || !f.ready(data)) return;
    const el = f.find();
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  });

  const rowEl = (id: string) => () => Array.from(document.querySelectorAll<HTMLElement>("[data-income-row]")).find((el) => el.dataset.incomeRow === id) ?? null;

  function closeForm() {
    setAddOpen(false);
    pendingFocus.current = { ready: () => true, find: () => addButtonRef.current?.querySelector<HTMLElement>("button") ?? null };
  }

  function added(entryId: string, name: string) {
    setAddOpen(false);
    setSelected(entryId);
    announce(`${name} added to Money in`);
    pendingFocus.current = { ready: (d) => d.incomes.some((i) => i.id === entryId), find: rowEl(entryId) };
  }

  async function confirm(ids: string[], single: boolean) {
    if (busy || ids.length === 0) return;
    setError(null);
    setBusy(single ? (ids[0] ?? "all") : "all");
    const jobs = ids.map((id) => {
      const inc = data.incomes.find((i) => i.id === id);
      const s = inc ? storedJob(inc, choices[id] ?? initialChoice(inc)) : { job: null, oneBucketId: null };
      return { id, job: s.job, oneBucketId: s.oneBucketId };
    });
    try {
      const r = await confirmIncomesAction({ ids, jobs });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      announce(r.names.length === 1 ? `${r.names[0]} confirmed` : `${r.count} incomes confirmed`);
      setSelected(undefined);
      pendingFocus.current = {
        ready: (d) => ids.every((id) => !d.incomes.some((i) => i.id === id)),
        find: () => document.querySelector<HTMLElement>("[data-income-row]") ?? document.getElementById(MOVE_MONEY_FOCUS_ID) ?? document.getElementById("money-in-s2"),
      };
    } catch {
      setError("Couldn't confirm. Nothing was changed. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const doneCount = data.done.length;
  const stepOneDone = queue.length === 0 && doneCount > 0;

  return (
    <>
      <PageHeader
        title={copy.title}
        lede={copy.lede}
        actions={
          addOpen ? null : (
            <div ref={addButtonRef}>
              <Button variant="soft" onClick={() => setAddOpen(true)} data-testid="add-income-button">
                + Add income
              </Button>
            </div>
          )
        }
      />
      <div className={styles.two}>
        <div className={styles.steps}>
          {addOpen ? <AddIncomeForm data={data} onCancel={closeForm} onAdded={added} /> : null}

          {phase !== "empty" ? (
            <Card as="section" aria-labelledby="money-in-s1" className={styles.stepChoose} data-testid="choose-step">
              <div className={stepOneDone ? styles.stepDone : undefined}>
                <StepHead n={1} done={stepOneDone} id="money-in-s1" title="Choose each one's job" sub={`${doneCount} of ${doneCount + queue.length} done`} />
              </div>
              {queue.length > 0 ? (
                <>
                  <div className={styles.queue} data-testid="queue">
                    {queue.map((inc) => {
                      const preview = previews.get(inc.id) ?? { kind: "needs" as const, reason: "ask" as const };
                      return (
                        <QueueRow
                          key={inc.id}
                          data={data}
                          income={inc}
                          source={data.sources.find((s) => s.id === inc.sourceId)}
                          preview={preview}
                          choice={choices[inc.id] ?? initialChoice(inc)}
                          open={openId === inc.id}
                          canConfirmOne={queue.length > 1}
                          busy={busy === inc.id}
                          onToggle={() => setSelected(openId === inc.id ? null : inc.id)}
                          onChoice={(c) => {
                            setChoices((all) => ({ ...all, [inc.id]: c }));
                            setSelected(inc.id); // keep this row open: picking a job must not make the default row jump
                          }}
                          onConfirmOne={() => confirm([inc.id], true)}
                        />
                      );
                    })}
                  </div>
                  <div className={styles.confirmBar}>
                    <Button
                      variant={addOpen ? "soft" : "primary"}
                      disabled={summary.readyIds.length === 0}
                      loading={busy === "all"}
                      loadingLabel="Confirming"
                      onClick={() => confirm(summary.readyIds, false)}
                      data-testid="confirm-all"
                    >
                      {confirmAllLabel(summary)}
                    </Button>
                    <span className={styles.helper}>{needsHelper(summary.needNames, summary.total)}</span>
                  </div>
                  <p className={styles.formError} role="alert" data-testid="confirm-error">
                    {error}
                  </p>
                </>
              ) : null}
              {doneCount > 0 ? (
                <ul className={styles.doneList} aria-label="Confirmed">
                  {data.done.map((d) => (
                    <li key={d.entryId} className={styles.doneRow}>
                      <span className={styles.ckd} aria-hidden="true">
                        <CheckIcon />
                      </span>
                      <span>
                        <b>{d.name}</b> <small>{d.how}</small>
                      </span>
                      <span className={styles.doneVal} data-amount>
                        {formatPeso(d.amountMinor)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          {phase !== "empty" ? <MoveMoneyStep phase={phase} confirmed={data.done} cycle={data.cycle} transferPlan={data.transferPlan} accounts={data.accounts} buckets={data.buckets} /> : null}
        </div>

        {phase !== "empty" ? (
          <div className={styles.receiptCol}>
            <IncomeSlip model={slip} allIn={phase === "all_done"} todayIso={data.todayIso} />
          </div>
        ) : null}
      </div>
    </>
  );
}
