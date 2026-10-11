"use client";

import { useState, useSyncExternalStore } from "react";
import { Slip, SlipFoot, SlipLine, SlipMeta, SlipRule, SlipTitle } from "@/components/slip/Slip";
import { stampDate } from "@/lib/data/money-in-model";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import { buildSlip } from "@/lib/onboarding/slip";
import type { StepContext } from "@/lib/onboarding/step";
import { cn } from "@/lib/cn";
import styles from "./onboarding.module.css";

const subscribe = () => () => {};
/** False while rendering on the server and during hydration, true afterwards: rows that appear later get the print highlight. */
const useLive = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

/** A slip line that highlights the first time it fills (a CSS animation, switched off under reduced motion). */
function PrintedLine({ live, filled, children }: { live: boolean; filled: boolean; children: React.ReactNode }) {
  const [prevFilled, setPrevFilled] = useState(filled);
  const [fresh, setFresh] = useState(live && filled);
  if (filled !== prevFilled) {
    setPrevFilled(filled);
    setFresh(filled);
  }
  return (
    <div className={cn(styles.slipLine, fresh && styles.fresh)} data-fresh={fresh ? "" : undefined}>
      {children}
    </div>
  );
}

const EMPTY = "· · ·";

/**
 * The plan slip (SPEC §7.2): a receipt that prints a line for each answer. Unanswered lines wait as "· · ·".
 * At the end it stamps PLAN SET. Pure view over the draft; nothing here is saved.
 */
export function PlanSlip({ draft, ctx, done }: { draft: OnboardingDraft; ctx: Pick<StepContext, "todayIso">; done: boolean }) {
  const live = useLive();
  const m = buildSlip(draft, ctx);
  return (
    <Slip label="Plan slip" stamp={done ? "PLAN SET" : undefined} stampSub={done ? stampDate(ctx.todayIso) : undefined}>
      <SlipTitle>Plan slip</SlipTitle>
      <SlipMeta>
        {m.dateLine} · {done ? "set" : "being set up"}
      </SlipMeta>
      <SlipRule />
      {m.rows.map((r) => (
        <PrintedLine key={r.key} live={live} filled={r.value !== null}>
          <SlipLine label={r.label} value={r.value ?? EMPTY} dim={r.value === null} />
        </PrintedLine>
      ))}
      <SlipRule />
      {m.split ? (
        <>
          {m.split.lines.map((l) => (
            <PrintedLine key={l.bucket} live={live} filled>
              <SlipLine label={l.label} dot={`var(--b-${l.bucket})`} percent={`${l.pct}%`} value={l.amountText} />
            </PrintedLine>
          ))}
          <SlipRule />
          <SlipLine label="Total" value={`${m.split.totalPct}%`} total />
        </>
      ) : (
        <SlipLine label="Your split" value={EMPTY} dim />
      )}
      <PrintedLine live={live} filled={m.payday !== null}>
        <SlipLine label="On payday" value={m.payday ?? EMPTY} dim={m.payday === null} />
      </PrintedLine>
      <SlipFoot className={styles.slipFoot}>
        {m.billsNote ? `${m.billsNote} ` : ""}
        {done ? "Set. Every payday from here uses this plan." : "Fills in as you answer. Nothing is saved until you finish."}
      </SlipFoot>
    </Slip>
  );
}
