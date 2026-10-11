import { appIncomeStep } from "@/components/onboarding/steps/AppIncome";
import { categoriesStep } from "@/components/onboarding/steps/Categories";
import { firstPayStep } from "@/components/onboarding/steps/FirstPay";
// Web-path Income and Accounts are still placeholders (ticket 20).
import { accountsStep, webIncomeStep } from "@/components/onboarding/steps/placeholders";
import { prioStep } from "@/components/onboarding/steps/Priorities";
import { planStep } from "@/components/onboarding/steps/YourPlan";
import { homesStep } from "@/components/onboarding/steps/WhereItLives";
import { yourAppStep } from "@/components/onboarding/steps/YourApp";
import type { OnboardingDraft, StepId } from "./draft";
import type { PhoneFacts } from "./facts";
import { stepsFor } from "./route";
import type { ShellStepModule } from "./shell-types";
import type { StepContext, StepError } from "./step";

/** The module for a step id on a path (Income is a different step on the web and app paths). `null` for "welcome". */
export function moduleFor(id: StepId, path: "web" | "app" | null): ShellStepModule | null {
  switch (id) {
    case "app":
      return yourAppStep;
    case "income":
      return path === "app" ? appIncomeStep : webIncomeStep;
    case "accounts":
      return accountsStep;
    case "prio":
      return prioStep;
    case "plan":
      return planStep;
    case "homes":
      return homesStep;
    case "cats":
      return categoriesStep;
    case "first":
      return firstPayStep;
    default:
      return null;
  }
}

/** The step modules for the draft's path, in order. */
export function modulesFor(draft: Pick<OnboardingDraft, "path" | "planOnly">): ShellStepModule[] {
  return stepsFor(draft)
    .map((id) => moduleFor(id, draft.path))
    .filter((m): m is ShellStepModule => m !== null);
}

/** The defaults a step fills when it's entered: its own `onEnter`, then anything it derives from the phone's facts. */
export function enterPatch(mod: ShellStepModule, draft: OnboardingDraft, ctx: StepContext, facts: PhoneFacts | null): Partial<OnboardingDraft> | null {
  const a = mod.onEnter?.(draft, ctx) ?? null;
  const b = mod.enterWithFacts?.(a ? { ...draft, ...a } : draft, ctx, facts) ?? null;
  return a || b ? { ...a, ...b } : null;
}

/** First problem that blocks Continue on this step, or null. */
export function validateStep(mod: ShellStepModule, draft: OnboardingDraft, ctx: StepContext, facts: PhoneFacts | null): StepError | null {
  return mod.validate(draft, ctx) ?? mod.validateWithFacts?.(draft, ctx, facts) ?? null;
}

/**
 * Deep links: the first step before `target` whose answers don't pass yet (entering each step first, so its defaults
 * count). A visit past it is sent back there, so nobody lands on a step whose inputs don't exist.
 */
export function firstBlockedBefore(draft: OnboardingDraft, ctx: StepContext, facts: PhoneFacts | null, target: StepId): StepId | null {
  let d = draft;
  for (const id of stepsFor(draft)) {
    if (id === target) return null;
    const mod = moduleFor(id, draft.path);
    if (!mod) continue;
    const patch = enterPatch(mod, d, ctx, facts);
    if (patch) d = { ...d, ...patch };
    if (validateStep(mod, d, ctx, facts)) return id;
  }
  return null;
}
