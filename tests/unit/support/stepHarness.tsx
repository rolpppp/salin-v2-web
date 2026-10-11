import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import type { StepContext, StepError, StepModule } from "@/lib/onboarding/step";

/** What a test reads back from the harness. */
export interface HarnessProbe {
  draft: OnboardingDraft;
  announcements: string[];
  submits: number;
  error: StepError | null;
}

export interface HarnessHooks {
  onState: (draft: OnboardingDraft, error: StepError | null) => void;
  onAnnounce: (message: string) => void;
  onSubmit: () => void;
}

/** A probe plus the hooks that fill it. Mutation happens here, outside any component. */
export function newProbe(): { probe: HarnessProbe; hooks: HarnessHooks } {
  const probe: HarnessProbe = { draft: undefined as unknown as OnboardingDraft, announcements: [], submits: 0, error: null };
  return {
    probe,
    hooks: {
      onState: (draft, error) => {
        probe.draft = draft;
        probe.error = error;
      },
      onAnnounce: (m) => {
        probe.announcements.push(m);
      },
      onSubmit: () => {
        probe.submits += 1;
      },
    },
  };
}

/**
 * A tiny stand-in for the onboarding shell: renders one step inside a <form> with draft state, runs `onEnter` once,
 * validates on submit and shows the error with role="alert". Not the real shell.
 */
export function StepHarness({ step, initial, ctx, hooks }: { step: StepModule; initial: OnboardingDraft; ctx: StepContext; hooks: HarnessHooks }): ReactNode {
  const [draft, setDraft] = useState<OnboardingDraft>(() => ({ ...initial, ...(step.onEnter?.(initial, ctx) ?? {}) }));
  const [error, setError] = useState<StepError | null>(null);
  const [live, setLive] = useState("");

  useEffect(() => {
    hooks.onState(draft, error);
  }, [hooks, draft, error]);

  const update = useCallback((patch: Partial<OnboardingDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);
  const announce = useCallback(
    (m: string) => {
      hooks.onAnnounce(m);
      setLive(m);
    },
    [hooks],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const err = step.validate(draft, ctx);
        setError(err);
        if (!err) hooks.onSubmit();
      }}
    >
      <h1>{step.question(draft, ctx)}</h1>
      <step.Body draft={draft} ctx={ctx} update={update} errorField={error?.field ?? null} announce={announce} />
      {error ? <p role="alert">{error.message}</p> : null}
      <div aria-live="polite">{live}</div>
      <button type="submit">{step.primaryLabel?.(draft) ?? "Continue"}</button>
    </form>
  );
}
