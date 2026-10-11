import { Button } from "@/components/button/Button";
import { shortDate } from "@/lib/data/money-in-model";
import { formatPeso } from "@/lib/money";
import { initFirstPay, otherIncomeWaiting } from "@/lib/onboarding/appPath";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepBodyProps } from "@/lib/onboarding/step";
import { useOnboardingEnv } from "../env";
import styles from "./app-steps.module.css";

/**
 * SPEC §7.4 step 7 / §7.3 step 6, entry only. "Do it later" finishes onboarding right here; "Give it a job" records
 * the choice and stops at a placeholder: the split, move and done stages are ticket 18 (SPEC §7.5).
 */

function AppPay({ draft }: { draft: OnboardingDraft }) {
  const { facts } = useOnboardingEnv();
  const main = draft.sources.find((s) => s.isMain);
  const latest = facts?.sources.find((s) => s.categoryId === main?.key);
  const landed = facts?.accounts.find((a) => a.id === latest?.latestAccountId)?.name ?? draft.accounts.find((a) => a.id === draft.landingAccountId)?.name ?? null;
  const others = facts ? otherIncomeWaiting(draft, facts) : [];
  const othersTotal = others.reduce((t, o) => t + o.amountMinor, 0);
  return (
    <>
      <div className={styles.incomeCard}>
        <span>
          <b>{main?.name ?? "Your pay"}</b>
          <small>
            {draft.firstPay.date ? shortDate(draft.firstPay.date) : ""}
            {landed ? ` · landed in ${landed}` : ""}
          </small>
        </span>
        <b>{draft.firstPay.amountMinor ? formatPeso(draft.firstPay.amountMinor) : ""}</b>
      </div>
      {others.length > 0 ? (
        <p className={styles.note}>
          {formatPeso(othersTotal)} from {others.length} more {others.length === 1 ? "income is" : "incomes are"} in Money in too: {others.map((o) => `${o.name} (${o.how})`).join(" and ")}.
        </p>
      ) : null}
    </>
  );
}

function FirstPayBody({ draft }: StepBodyProps) {
  if (draft.firstPay.choice === "yes") {
    return <p className={styles.coming}>Split, move, done come next. Your answers are saved; nothing has been written to your plan yet.</p>;
  }
  if (draft.path === "app") return <AppPay draft={draft} />;
  return <p className={styles.note}>Give it a job now and you&apos;ll see your plan work on real money. It takes a minute.</p>;
}

function DoItLater({ draft }: StepBodyProps) {
  const { finishLater, finishing } = useOnboardingEnv();
  if (draft.firstPay.choice === "yes") return null;
  return (
    <Button variant="quiet" onClick={finishLater} disabled={finishing}>
      {draft.path === "app" ? "Do it later" : "Not yet"}
    </Button>
  );
}

export const firstPayStep: ShellStepModule = {
  id: "first",
  label: "First pay",
  question: (draft) => {
    if (draft.firstPay.choice === "yes") return "Next: split, move, done";
    if (draft.path === "app" && draft.firstPay.date) return `Your ${shortDate(draft.firstPay.date)} pay is waiting for a job`;
    return "Has money come in since your last payday?";
  },
  reason: (draft) =>
    draft.path === "app"
      ? "It came in on your phone, but it hasn't been split yet. Give it a job now and you'll see your plan work on real money."
      : "You can add it now, or on payday. Either way your plan is ready.",
  Body: FirstPayBody,
  Extra: DoItLater,
  primaryLabel: (draft) => (draft.path === "app" ? "Give it a job" : "Yes, I'll add it"),
  primaryDisabled: (draft) => draft.firstPay.choice === "yes",
  validate: (draft) => (draft.path === "app" && !draft.firstPay.entryId ? { field: "ob-primary", message: "We couldn't find your latest pay. Go back to Income and pick your main pay." } : null),
  enterWithFacts: (draft, _ctx, facts) => initFirstPay(draft, facts),
  onAdvance: (draft) => ({ firstPay: { ...draft.firstPay, choice: "yes" } }),
  onBack: (draft) => (draft.firstPay.choice === "yes" ? { firstPay: { ...draft.firstPay, choice: null } } : null),
};
