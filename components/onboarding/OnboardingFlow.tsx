"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { Button } from "@/components/button/Button";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { finishOnboarding, loadPhoneData, saveDraft, trackOnboarding, type OnboardingEvent } from "@/lib/actions/onboarding";
import { createAutosaver } from "@/lib/onboarding/autosave";
import { emptyDraft, type OnboardingDraft, type StepId } from "@/lib/onboarding/draft";
import type { PhoneFacts } from "@/lib/onboarding/facts";
import { enterPatch, firstBlockedBefore, moduleFor, validateStep } from "@/lib/onboarding/registry";
import { nextStepId, prevStepId, resolveRoute, stepHref, stepParamFrom, stepsFor, type RouteView } from "@/lib/onboarding/route";
import type { StepContext, StepError } from "@/lib/onboarding/step";
import { undoSkipOnBack } from "@/lib/onboarding/web-path";
import { nowMs } from "@/lib/time";
import { OnboardingEnvContext, type OnboardingEnv } from "./env";
import styles from "./onboarding.module.css";
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

  const choose = (path: "web" | "app") => {
    const first = path === "web" ? "income" : "app";
    const base = previousPath === path ? stored : emptyDraft();
    setStored({ ...base, path, step: first });
    track({ event: "onboarding_started", props: { path, auto_detected: false } });
    goTo(stepHref(first));
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

  /** Save what's on screen, then run the one SQL transaction, then go to Today. */
  const finishNow = useCallback(
    async (final: OnboardingDraft) => {
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
      announce("Your plan is set. Opening Today.");
      router.push("/today");
    },
    [saver, announce, router],
  );

  const finishLater = useCallback(() => {
    const final: OnboardingDraft = { ...draft, firstPay: { ...draft.firstPay, choice: "later" } };
    setStored(final);
    void finishNow(final);
  }, [draft, finishNow]);

  const env = useMemo<OnboardingEnv>(() => ({ userId, facts, refreshPhone, track, switchToWeb, finishLater, finishing }), [userId, facts, refreshPhone, track, switchToWeb, finishLater, finishing]);

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
    track({ event: "onboarding_step_completed", props: { path: draft.path ?? ctx.path, step: stepId, seconds_on_step: Math.max(0, Math.round((nowMs() - stepStartedAt.current) / 1000)) } });
    const adv = mod.onAdvance?.(draft) ?? null;
    const next = adv ? { ...draft, ...adv } : draft;
    if (adv) update(adv);
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
    return <Welcome onChoose={choose} />;
  }

  const bodyProps = { draft, ctx, update, errorField: error?.field ?? null, announce };
  const showBack = !(index === 0 && (draft.planOnly || autoDetected));
  const kicker = draft.planOnly ? `Make a plan · ${index + 1} of ${steps.length} · ${mod.label}` : `Step ${index + 1} of ${steps.length} · ${mod.label}`;
  const primary = mod.primaryLabel?.(draft) ?? (isLast && draft.planOnly ? "Save my plan" : "Continue");
  const Extra = mod.Extra;
  const Body = mod.Body;
  const planSet = stepId === "first" && draft.firstPay.choice !== null;

  return (
    <OnboardingEnvContext.Provider value={env}>
      <Rail steps={modulesLabels(steps, draft.path)} currentIndex={index} showSignedIn={!draft.planOnly} />
      <div className={styles.grid}>
        <div>
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
        </div>
        <aside className={styles.side} aria-label="Your plan so far">
          <PlanSlip draft={draft} ctx={ctx} done={planSet} />
        </aside>
      </div>
    </OnboardingEnvContext.Provider>
  );
}

function modulesLabels(steps: readonly StepId[], path: OnboardingDraft["path"]) {
  return steps.map((id) => ({ id, label: moduleFor(id, path)?.label ?? id }));
}
