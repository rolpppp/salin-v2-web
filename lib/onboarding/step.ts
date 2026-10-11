import type { ComponentType } from "react";
import type { DraftBucket, OnboardingDraft, StepId } from "./draft";

/**
 * Contract between the onboarding shell (SPEC §7.2) and each step. The shell owns the rail, the kicker
 * ("Step 2 of 6 · Accounts"), the question `h1` (focused on every step change), the reason line, the plan slip,
 * Back / primary buttons (the primary is a submit, so Enter continues), the `role="alert"` error above the buttons,
 * and autosave. A step owns only its fields.
 *
 * Steps are pure over the draft: they read `draft`, propose changes with `update(patch)`, and never write to the
 * database. The shell merges patches, re-renders the slip and autosaves.
 */

/** Read-only facts the shell loads once per visit (from the phone's synced rows on the app path). */
export interface StepContext {
  path: "web" | "app";
  /** Today in the user's zone, `YYYY-MM-DD`. */
  todayIso: string;
  homeCurrency: string;
  /** App path: last calendar month's spending per bucket after auto-mapping, for the plan step's reality checks. */
  lastMonthSpendMinor: Partial<Record<DraftBucket, number>> | null;
  /** App path: monthly fixed bills from mobile `recurring_rules` (outflows), with the earliest future start date if any. */
  phoneBills: { totalMinor: number; startsOn: string | null } | null;
}

export interface StepError {
  /** The field's DOM id; the shell moves focus there. */
  field: string;
  message: string;
}

export interface StepBodyProps {
  draft: OnboardingDraft;
  ctx: StepContext;
  update: (patch: Partial<OnboardingDraft>) => void;
  /** Field id of the current error, if it belongs to this step (for `aria-invalid`). */
  errorField: string | null;
  /** Announce through the shared polite live region (e.g. "Switched to 50/30/20. Your edits were replaced."). */
  announce: (message: string) => void;
}

export interface StepModule {
  id: StepId;
  /** Rail pill label: "Income", "Accounts", "Priorities", "Your plan", "Where it lives", "Categories", "First pay". */
  label: string;
  question: (draft: OnboardingDraft, ctx: StepContext) => string;
  reason: (draft: OnboardingDraft, ctx: StepContext) => string;
  Body: ComponentType<StepBodyProps>;
  /** First problem that blocks Continue, or null. Runs on submit; the shell shows it and focuses `field`. */
  validate: (draft: OnboardingDraft, ctx: StepContext) => StepError | null;
  /** Called by the shell when the step is entered, to fill defaults (e.g. copy the suggestion in). Pure. */
  onEnter?: (draft: OnboardingDraft, ctx: StepContext) => Partial<OnboardingDraft> | null;
  /** Primary button label; default "Continue". */
  primaryLabel?: (draft: OnboardingDraft) => string;
}
