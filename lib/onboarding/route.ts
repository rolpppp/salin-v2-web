import { APP_STEPS, STEP_IDS, WEB_STEPS, planOnlySteps, type OnboardingDraft, type StepId } from "./draft";

/** The step list for a draft's path ([] until a path is chosen). */
export function stepsFor(draft: Pick<OnboardingDraft, "path" | "planOnly">): readonly StepId[] {
  if (draft.planOnly) return planOnlySteps(draft.path ?? "web");
  if (draft.path === "app") return APP_STEPS;
  if (draft.path === "web") return WEB_STEPS;
  return [];
}

/** `/welcome/income` -> `income`, `/welcome` -> null. Anything else under /welcome comes back as-is (invalid). */
export function stepParamFrom(pathname: string): string | null {
  const m = /^\/welcome(?:\/([^/?#]*))?\/?$/.exec(pathname);
  return m?.[1] ? m[1] : null;
}

export const stepHref = (id: StepId | "welcome"): string => (id === "welcome" ? "/welcome" : `/welcome/${id}`);

export type RouteView = { kind: "welcome" } | { kind: "step"; id: StepId } | { kind: "redirect"; to: string };

export interface Resolved {
  view: RouteView;
  /** The draft with the route applied: `step` follows the URL, and a bare deep link to "Your app" adopts the app path. */
  draft: OnboardingDraft;
}

/**
 * Where a visit to `/welcome[/step]` lands (SPEC §0, §7.1): resume at `draft.step`, skip the question when the phone
 * already synced (D-29), and refuse steps that aren't on this path's list. Pure; the shell redirects on `redirect`.
 */
export function resolveRoute(input: { param: string | null; draft: OnboardingDraft; autoDetected: boolean; /** First load of the page (not an in-app navigation): resume where the draft left off. */ resume: boolean }): Resolved {
  const { param, draft, autoDetected, resume } = input;
  const keep = (view: RouteView): Resolved => ({ view, draft });

  if (param === null) {
    if (!resume) return keep({ kind: "welcome" });
    if (draft.path !== null && draft.step !== "welcome" && stepsFor(draft).includes(draft.step)) return keep({ kind: "redirect", to: stepHref(draft.step) });
    if (draft.path === null && autoDetected && !draft.planOnly) return keep({ kind: "redirect", to: stepHref("app") });
    return keep({ kind: "welcome" });
  }

  const id = (STEP_IDS as readonly string[]).includes(param) ? (param as StepId) : null;
  if (id === null || id === "welcome") return keep({ kind: "redirect", to: "/welcome" });

  const path = draft.path ?? (id === "app" ? "app" : null);
  if (path === null) return keep({ kind: "redirect", to: "/welcome" });
  const withPath: OnboardingDraft = { ...draft, path };
  const steps = stepsFor(withPath);
  if (!steps.includes(id)) {
    const fallback = steps.includes(draft.step) ? stepHref(draft.step) : steps[0] ? stepHref(steps[0]) : "/welcome";
    return keep({ kind: "redirect", to: fallback });
  }
  return { view: { kind: "step", id }, draft: withPath.step === id ? withPath : { ...withPath, step: id } };
}

export const nextStepId = (steps: readonly StepId[], id: StepId): StepId | null => steps[steps.indexOf(id) + 1] ?? null;
export const prevStepId = (steps: readonly StepId[], id: StepId): StepId | null => (steps.indexOf(id) > 0 ? (steps[steps.indexOf(id) - 1] as StepId) : null);
