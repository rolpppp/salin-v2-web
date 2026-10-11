import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepId } from "@/lib/onboarding/draft";
import styles from "./app-steps.module.css";

/**
 * Stand-ins for steps other tickets own, so the shell runs end to end today. Each says "Coming next" and validates as
 * done. The PM swaps the imports in `lib/onboarding/registry.ts`:
 *  - `prioStep`, `planStep`, `homesStep` -> `components/onboarding/steps/{Priorities,YourPlan,WhereItLives}.tsx`
 *  - `webIncomeStep`, `accountsStep` -> the web-path steps (ticket 20)
 */
function placeholder(id: StepId, label: string, question: string, reason: string): ShellStepModule {
  return {
    id,
    label,
    question: () => question,
    reason: () => reason,
    Body: () => <p className={styles.coming}>Coming next</p>,
    validate: () => null,
  };
}


export const webIncomeStep = placeholder("income", "Income", "What money comes in?", "Start with the money you count on most. Your plan is built around it.");
export const accountsStep = placeholder("accounts", "Accounts", "Where does your money sit?", "No bank login: Salin only needs the names, so it can tell you what to move where.");
