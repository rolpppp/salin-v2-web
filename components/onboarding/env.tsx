"use client";

import { createContext, useContext } from "react";
import type { OnboardingEvent } from "@/lib/actions/onboarding";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import type { PhoneFacts } from "@/lib/onboarding/facts";

/**
 * What the shell lends to the steps beyond the `StepModule` contract: the phone's synced facts (app path), a way to
 * re-read them, analytics, and the two exits that leave the step list (switch to the web path, finish later).
 */
export interface OnboardingEnv {
  userId: string;
  /** What the phone has synced, or null while nothing has. */
  facts: PhoneFacts | null;
  /** Re-read the phone's rows (coalesced). Resolves true once something has synced. */
  refreshPhone: () => Promise<boolean>;
  track: (event: OnboardingEvent) => void;
  /** "Continue without the app": start the web path from scratch. */
  switchToWeb: () => void;
  /** "Do it later": record the choice, finish, go to Today. */
  finishLater: () => void;
  /** Finish with this draft (flush, then the one SQL transaction). "done" shows the Done card in place; "today" opens Today. */
  finish: (final: OnboardingDraft, after: "done" | "today") => Promise<void>;
  finishing: boolean;
}

export const OnboardingEnvContext = createContext<OnboardingEnv | null>(null);

export function useOnboardingEnv(): OnboardingEnv {
  const env = useContext(OnboardingEnvContext);
  if (!env) throw new Error("useOnboardingEnv must be used inside the onboarding shell");
  return env;
}
