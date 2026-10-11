import type { ComponentType } from "react";
import type { OnboardingDraft } from "./draft";
import type { PhoneFacts } from "./facts";
import type { StepBodyProps, StepContext, StepError, StepModule } from "./step";

/**
 * What the shell adds on top of the `StepModule` contract (P-8). Steps from other tickets implement plain
 * `StepModule`; the app-path steps and First pay use these optional extras. Nothing here changes the contract.
 */
export interface ShellStepModule extends StepModule {
  /** Rendered in the footer between Back and the primary (e.g. "Do it later", "Continue without the app"). */
  Extra?: ComponentType<StepBodyProps>;
  /** Fill defaults from the phone's synced rows when the step is entered. Pure; runs after `onEnter`. */
  enterWithFacts?: (draft: OnboardingDraft, ctx: StepContext, facts: PhoneFacts | null) => Partial<OnboardingDraft> | null;
  /** Patch applied when the primary succeeds, before moving on (e.g. First pay's "Give it a job" sets the choice). */
  onAdvance?: (draft: OnboardingDraft) => Partial<OnboardingDraft> | null;
  /** Checks that need the phone's facts; runs after `validate` passes. */
  validateWithFacts?: (draft: OnboardingDraft, ctx: StepContext, facts: PhoneFacts | null) => StepError | null;
  /** Back pressed: return a patch to stay on this step (e.g. undo "Give it a job"), or null to go to the previous step. */
  onBack?: (draft: OnboardingDraft) => Partial<OnboardingDraft> | null;
  /** The primary can't be used yet (e.g. still waiting for the phone). */
  primaryDisabled?: (draft: OnboardingDraft, facts: PhoneFacts | null) => boolean;
}
