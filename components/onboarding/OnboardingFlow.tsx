"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { Button } from "@/components/button/Button";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { finishOnboarding, loadPhoneData, saveDraft, trackOnboarding, type OnboardingEvent } from "@/lib/actions/onboarding";
import { createAutosaver } from "@/lib/onboarding/autosave";
import { emptyDraft, type OnboardingDraft, type Pattern, type StepId } from "@/lib/onboarding/draft";
import type { PhoneFacts } from "@/lib/onboarding/facts";
import { completedProps, finalDraft, parseSummary, type FinishSummary } from "@/lib/onboarding/first-pay";
import { enterPatch, firstBlockedBefore, moduleFor, validateStep } from "@/lib/onboarding/registry";
import { nextStepId, prevStepId, resolveRoute, stepHref, stepParamFrom, stepsFor, type RouteView } from "@/lib/onboarding/route";
import type { StepContext, StepError } from "@/lib/onboarding/step";
import { isSimple, startPattern } from "@/lib/onboarding/simple-path";
import { undoSkipOnBack } from "@/lib/onboarding/web-path";
import { nowMs } from "@/lib/time";
import { OnboardingEnvContext, type OnboardingEnv } from "./env";
import styles from "./onboarding.module.css";
import { DoneCard } from "./first-pay/DoneCard";
import { SimpleDone } from "./SimpleDone";
import { AppNote } from "./AppNote";
import { PlanSlip } from "./PlanSlip";
import { Rail } from "./Rail";
import { Welcome } from "./Welcome";

export interface OnboardingFlowProps {
  initialDraft: OnboardingDraft;
  initialCtx: StepContext;
  initialFacts: PhoneFacts | null;
  /** D-29: the account already has synced rows. */
  autoDetected: boolean;
  userId: string;
}

/** The context the steps see: the phone facts only exist on the app path. */
function ctxFor(base: StepContext, path: OnboardingDraft["path"]): StepContext {
  const p = path ?? base.path;
  return p === "web" ? { ...base, path: p, lastMonthSpendMinor: null, phoneBills: null } : { ...base, path: p };
}

const focusField = (id: string) => {
  const el = document.getElementById(id) ?? document.getElementById("ob-err");
  el?.focus();
};

/**
 * The onboarding shell (SPEC §7.2). Owns the route, the draft, autosave, the rail, the step card (kicker, question
 * `h1`, reason, Back / primary submit, error above the buttons) and the plan slip. Steps own only their fields.
 *
 * The URL decides the step (deep links and Back/Forward work); `resolveRoute` turns it into a view and the draft
 * with the route applied. Navigation never waits on the network: the draft is saved in the background.
 */
export function OnboardingFlow({ initialDraft, initialCtx, initialFacts, autoDetected, userId }: OnboardingFlowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const announce = useAnnounce();
  const param = stepParamFrom(pathname);

  const [stored, setStored] = useState(initialDraft);
  const [baseCtx, setBaseCtx] = useState(initialCtx);
  const [facts, setFacts] = useState(initialFacts);
  const [navigated, setNavigated] = useState(false);
  const [previousPath, setPreviousPath] = useState<"web" | "app" | null>(null);
  const [error, setError] = useState<StepError | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  /** Set once Finish succeeded with "show Done": the Done card replaces the step card in place. */
  const [done, setDone] = useState<{ draft: OnboardingDraft; summary: FinishSummary | null } | null>(null);
  const startedAt = useRef(nowMs());
  const completedFired = useRef(false);
  const [entered, setEntered] = useState<{ id: string | null; facts: PhoneFacts | null }>({ id: null, facts: initialFacts });

  // ------------------------------------------------------------ route -> view
  const resolved = useMemo(() => resolveRoute({ param, draft: stored, autoDetected, resume: !navigated }), [param, stored, autoDetected, navigated]);
  const draft = resolved.draft;
  const ctx = useMemo(() => ctxFor(baseCtx, draft.path), [baseCtx, draft.path]);
  let view: RouteView = resolved.view;
  if (view.kind === "step") {
    const blocked = firstBlockedBefore(draft, ctx, facts, view.id);
    if (blocked) view = { kind: "redirect", to: stepHref(blocked) };
  }
  const stepId = view.kind === "step" ? view.id : null;
  const mod = stepId ? moduleFor(stepId, draft.path) : null;

  // Entering a step (by any route) fills its defaults; new phone facts refill what depends on them. Both are pure.
  if (entered.id !== stepId || entered.facts !== facts) {
    setEntered({ id: stepId, facts });
    if (mod && stepId) {
      const patch = entered.id !== stepId ? enterPatch(mod, draft, ctx, facts) : (mod.enterWithFacts?.(draft, ctx, facts) ?? null);
      setStored(patch ? { ...draft, ...patch } : draft);
    }
  }

  const redirectTo = view.kind === "redirect" ? view.to : null;
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  // ------------------------------------------------------------ autosave
  const [saver] = useState(() =>
    createAutosaver({
      baseline: JSON.stringify(initialDraft),
      save: async (d) => ({ ok: (await saveDraft(d)).ok }),
      onStatus: (ok) => setSaveFailed(!ok),
    }),
  );
  useEffect(() => {
    saver.schedule(draft);
  }, [saver, draft]);
  useEffect(() => {
    void saver.flush();
  }, [saver, draft.step]);
  useEffect(
    () => () => {
      void saver.flush();
    },
    [saver],
  );

  // ------------------------------------------------------------ analytics
  const track = useCallback((event: OnboardingEvent) => {
    void trackOnboarding(event);
  }, []);
  const startedFired = useRef(false);
  useEffect(() => {
    if (autoDetected && initialDraft.path === null && draft.path === "app" && stepId === "app" && !startedFired.current) {
      startedFired.current = true;
      track({ event: "onboarding_started", props: { path: "app", auto_detected: true } });
    }
  }, [autoDetected, initialDraft.path, draft.path, stepId, track]);
  const stepStartedAt = useRef(0);
  useEffect(() => {
    stepStartedAt.current = nowMs();
  }, [stepId]);

  // ------------------------------------------------------------ focus the question on every step change
  const h1 = useRef<HTMLHeadingElement>(null);
  const question = mod && stepId ? mod.question(draft, ctx) : "";
  useEffect(() => {
    if (stepId) h1.current?.focus();
  }, [stepId, question]);

  // ------------------------------------------------------------ actions
  const update = useCallback(
    (patch: Partial<OnboardingDraft>) => {
      setStored((s) => ({ ...resolveRoute({ param, draft: s, autoDetected, resume: false }).draft, ...patch }));
      setError(null);
    },
    [param, autoDetected],
  );

  const goTo = useCallback(
    (to: string) => {
      setNavigated(true);
      setError(null);
      router.push(to);
    },
    [router],
  );

  const choose = (pattern: Pattern) => {
    const patch = startPattern(pattern, userId);
    const base = previousPath === "web" && stored.pattern === pattern ? stored : emptyDraft();
    setStored({ ...base, ...patch });
    track({ event: "onboarding_started", props: { path: "web", auto_detected: false } });
    goTo(stepHref(patch.step as StepId));
  };

  const chooseApp = () => {
    const base = previousPath === "app" ? stored : emptyDraft();
    setStored({ ...base, path: "app", step: "app" });
    track({ event: "onboarding_started", props: { path: "app", auto_detected: false } });
    goTo(stepHref("app"));
  };

  const switchToWeb = useCallback(() => {
    setStored({ ...emptyDraft(), path: "web", step: "income" });
    goTo(stepHref("income"));
  }, [goTo]);

  const phoneJson = useRef(JSON.stringify(initialFacts));
  const refreshing = useRef<Promise<boolean> | null>(null);
  const again = useRef(false);
  const refreshPhone = useCallback((): Promise<boolean> => {
    if (refreshing.current) {
      again.current = true;
      return refreshing.current;
    }
    const run = (async () => {
      let found = false;
      do {
        again.current = false;
        const r = await loadPhoneData();
        if (r.ok && r.value) {
          const json = JSON.stringify(r.value.facts);
          if (json !== phoneJson.current) {
            phoneJson.current = json;
            setFacts(r.value.facts);
            setBaseCtx((c) => ({ ...c, ...r.value!.ctx }));
          }
          found = r.value.facts !== null;
        }
      } while (again.current);
      return found;
    })().finally(() => {
      refreshing.current = null;
    });
    refreshing.current = run;
    return run;
  }, []);

  /** Save what's on screen, then run the one SQL transaction, then show Done or go to Today. */
  const finishNow = useCallback(
    async (given: OnboardingDraft, after: "done" | "today" = "today") => {
      const final = finalDraft(given);
      setFinishing(true);
      setError(null);
      saver.schedule(final);
      await saver.flush();
      if (!saver.lastOk()) {
        setFinishing(false);
        setError({ field: "ob-primary", message: "Couldn't save your answers. Check your connection and try again." });
        focusField("ob-primary");
        return;
      }
      const r = await finishOnboarding();
      if (!r.ok) {
        setFinishing(false);
        setError({ field: "ob-primary", message: r.error });
        focusField("ob-primary");
        return;
      }
      if (!final.planOnly && !completedFired.current) {
        completedFired.current = true;
        track({ event: "onboarding_completed", props: completedProps(final, (nowMs() - startedAt.current) / 60_000) });
      }
      if (after === "done") {
        setFinishing(false);
        setDone({ draft: final, summary: parseSummary(r.value?.summary ?? null) });
        announce(isSimple(final) ? "You're set." : "Every peso has a home.");
        return;
      }
      announce("Your plan is set. Opening Today.");
      // First time through: Today opens with the tour. Make a plan from Today (planOnly) has seen it already.
      router.push(final.planOnly ? "/today" : "/today?tour=1");
    },
    [saver, announce, router, track],
  );

  const finishLater = useCallback(() => {
    const final: OnboardingDraft = { ...draft, firstPay: { ...draft.firstPay, choice: "later" } };
    setStored(final);
    void finishNow(final);
  }, [draft, finishNow]);

  const env = useMemo<OnboardingEnv>(() => ({ userId, facts, refreshPhone, track, switchToWeb, finishLater, finish: finishNow, finishing }), [userId, facts, refreshPhone, track, switchToWeb, finishLater, finishNow, finishing]);

  const steps = stepsFor(draft);
  const index = stepId ? steps.indexOf(stepId) : -1;
  const isLast = index === steps.length - 1;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mod || !stepId || finishing) return;
    const problem = validateStep(mod, draft, ctx, facts);
    if (problem) {
      setError(problem);
      focusField(problem.field);
      return;
    }
    setError(null);
    const adv = mod.onAdvance?.(draft) ?? null;
    const next = adv ? { ...draft, ...adv } : draft;
    if (adv) update(adv);
    // A step with stages (First pay) counts as completed when its last stage finishes onboarding.
    const finishAfter = mod.finishOn?.(next) ?? null;
    if (!mod.finishOn || finishAfter) {
      track({ event: "onboarding_step_completed", props: { path: draft.path ?? ctx.path, step: stepId, seconds_on_step: Math.max(0, Math.round((nowMs() - stepStartedAt.current) / 1000)) } });
    }
    if (finishAfter) {
      await finishNow(next, finishAfter);
      return;
    }
    const nextId = nextStepId(steps, stepId);
    if (nextId) goTo(stepHref(nextId));
    else if (draft.planOnly) await finishNow(next);
  };

  const onBack = () => {
    if (!mod || !stepId) return;
    const stay = mod.onBack?.(draft) ?? null;
    if (stay) {
      update(stay);
      return;
    }
    // Back from First pay when just tracking returns to Priorities and undoes the skip (SPEC §7.6).
    const undo = undoSkipOnBack(draft, stepId);
    const prev = prevStepId(steps, stepId);
    if (prev) {
      if (undo) update(undo);
      goTo(stepHref(prev));
      return;
    }
    // Back from the first step returns to the question; the answers stay in case they pick the same path again.
    setPreviousPath(draft.path);
    setStored({ ...draft, path: null, step: "welcome" });
    goTo("/welcome");
  };

  // ------------------------------------------------------------ render
  if (view.kind === "redirect") return null;
  if (view.kind === "welcome" || !mod || !stepId) {
    return <Welcome onChoose={choose} onApp={chooseApp} />;
  }

  const bodyProps = { draft, ctx, update, errorField: error?.field ?? null, announce };
  const showBack = !(index === 0 && (draft.planOnly || autoDetected));
  const kicker = draft.planOnly ? `Make a plan · ${index + 1} of ${steps.length} · ${mod.label}` : `Step ${index + 1} of ${steps.length} · ${mod.label}`;
  const primary = mod.primaryLabel?.(draft) ?? (isLast && draft.planOnly ? "Save my plan" : "Continue");
  const Extra = mod.Extra;
  const Body = mod.Body;
  const planSet = done !== null;

  return (
    <OnboardingEnvContext.Provider value={env}>
      <Rail steps={modulesLabels(steps, draft.path)} currentIndex={index} showSignedIn={!draft.planOnly} />
      <div className={styles.grid}>
        <div>
          {done ? (
            isSimple(done.draft) ? <SimpleDone draft={done.draft} todayIso={ctx.todayIso} /> : <DoneCard draft={done.draft} summary={done.summary} />
          ) : (
          <form className={styles.card} onSubmit={onSubmit} noValidate aria-labelledby="ob-question">
            <header className={styles.head}>
              <p className={styles.kicker}>{kicker}</p>
              <h1 id="ob-question" ref={h1} tabIndex={-1} className={styles.h}>
                {question}
              </h1>
              <p className={styles.reason}>{mod.reason(draft, ctx)}</p>
            </header>
            <Body {...bodyProps} />
            {saveFailed ? (
              <p className={styles.saveNote} role="status">
                Couldn&apos;t save. We&apos;ll try again as you go.
              </p>
            ) : null}
            <p id="ob-err" role="alert" tabIndex={-1} className={styles.err}>
              {error?.message}
            </p>
            <div className={styles.nav}>
              {showBack ? (
                <Button variant="quiet" className={styles.back} onClick={onBack} disabled={finishing}>
                  Back
                </Button>
              ) : null}
              {Extra ? <Extra {...bodyProps} /> : null}
              <Button variant="primary" type="submit" id="ob-primary" className={styles.primary} loading={finishing} loadingLabel="Saving" disabled={mod.primaryDisabled?.(draft, facts) ?? false}>
                {primary}
                <ArrowRightIcon />
              </Button>
            </div>
          </form>
          )}
        </div>
        <aside className={styles.side} aria-label="Your plan so far">
          <PlanSlip draft={draft} ctx={ctx} done={planSet} />
        </aside>
        <div className={styles.footNote}>
          <AppNote name={draft.firstName} />
        </div>
      </div>
    </OnboardingEnvContext.Provider>
  );
}

function modulesLabels(steps: readonly StepId[], path: OnboardingDraft["path"]) {
  return steps.map((id) => ({ id, label: moduleFor(id, path)?.label ?? id }));
}
