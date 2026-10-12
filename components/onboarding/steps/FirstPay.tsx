import { Button } from "@/components/button/Button";
import { shortDate } from "@/lib/data/money-in-model";
import { formatPeso } from "@/lib/money";
import { initFirstPay, otherIncomeWaiting } from "@/lib/onboarding/appPath";
import { newUuidV4 } from "@/lib/domain/mobile";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import { backPatch, chooseYes, confirmSplit, finishAfter, previewFirstPay, sourceName, stageOf, submitEntry, validateEntry } from "@/lib/onboarding/first-pay";
import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepBodyProps } from "@/lib/onboarding/step";
import { useOnboardingEnv } from "../env";
import { EntryForm } from "../first-pay/EntryForm";
import { LaterStage } from "../first-pay/LaterStage";
import { MoveStage } from "../first-pay/MoveStage";
import { SplitStage } from "../first-pay/SplitStage";
import styles from "./app-steps.module.css";

/**
 * SPEC §7.3 step 6 / §7.4 step 7 / §7.5: one step with stages (entry, form, split, move, later), all derived from the
 * draft (`lib/onboarding/first-pay.ts`). Confirm split and ticks are staged in the draft; nothing is written until
 * Finish, which the shell runs (flush, `finish_onboarding`) when `finishOn` says this primary is the last one.
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

function FirstPayBody(props: StepBodyProps) {
  const { draft } = props;
  switch (stageOf(draft)) {
    case "form":
      return <EntryForm {...props} />;
    case "split":
      return <SplitStage draft={draft} />;
    case "move":
      return <MoveStage {...props} />;
    case "later":
      return <LaterStage {...props} />;
    default:
      return draft.path === "app" ? <AppPay draft={draft} /> : <p className={styles.note}>Give it a job now and you&apos;ll see your plan work on real money. It takes a minute.</p>;
  }
}

/** Footer extras: "Not yet" / "Do it later" on the first stage, "I'll send them later" on the move stage. */
function StageExtra({ draft, update }: StepBodyProps) {
  const { finish, finishing } = useOnboardingEnv();
  const stage = stageOf(draft);
  if (stage === "entry") {
    return (
      <Button variant="quiet" onClick={() => update({ firstPay: { ...draft.firstPay, choice: "later", reminder: "email" } })} disabled={finishing}>
        {draft.path === "app" ? "Do it later" : "Not yet"}
      </Button>
    );
  }
  if (stage === "move") {
    return (
      <Button variant="quiet" onClick={() => void finish(draft, "today")} disabled={finishing}>
        I&apos;ll send them later
      </Button>
    );
  }
  return null;
}

export const firstPayStep: ShellStepModule = {
  id: "first",
  label: "First pay",
  question: (draft) => {
    const p = previewFirstPay(draft);
    switch (stageOf(draft)) {
      case "form":
        return "What came in?";
      case "split":
        return p ? `${formatPeso(p.totalMinor)} from ${sourceName(draft)}, split by your plan` : "Your first pay, split by your plan";
      case "move":
        return "Now move the money";
      case "later":
        return "That's fine. Payday is the moment.";
      default:
        return draft.path === "app" && draft.firstPay.date ? `Your ${shortDate(draft.firstPay.date)} pay is waiting for a job` : "Has money come in since your last payday?";
    }
  },
  reason: (draft) => {
    switch (stageOf(draft)) {
      case "form":
        return "Enter what landed. Salin splits it by your plan.";
      case "split":
        return "Check it, then confirm. This is the same split every payday will use.";
      case "move":
        return "Open your banking app, send each one, then tick it here. Your accounts will match your buckets.";
      case "later": {
        const next = draft.income.nextPayday ? shortDate(draft.income.nextPayday) : "payday";
        return `On ${next}, add your pay${draft.path === "app" ? " here or in the app" : ""} and Salin splits it by your plan in one tap. Then you'll tick off the transfers.`;
      }
      default:
        return draft.path === "app"
          ? "It came in on your phone, but it hasn't been split yet. Give it a job now and you'll see your plan work on real money."
          : "You can add it now, or on payday. Either way your plan is ready.";
    }
  },
  Body: FirstPayBody,
  Extra: StageExtra,
  primaryLabel: (draft) => {
    switch (stageOf(draft)) {
      case "form":
        return "See the split";
      case "split":
        return "Confirm split";
      case "move":
        return "Finish";
      case "later":
        return "Open Today";
      default:
        return draft.path === "app" ? "Give it a job" : "Yes, I'll add it";
    }
  },
  // Every tick is staged; the primary finishes once they're all in (ticking the last one does it too, the primary is the retry).
  primaryDisabled: (draft) => stageOf(draft) === "move" && !previewFirstPay(draft)?.allSent,
  validate: (draft, ctx) => {
    switch (stageOf(draft)) {
      case "form":
        return validateEntry(draft, ctx.todayIso);
      case "entry":
        return draft.path === "app" && !draft.firstPay.entryId ? { field: "ob-primary", message: "We couldn't find your latest pay. Go back to Income and pick your main pay." } : null;
      default:
        return null;
    }
  },
  enterWithFacts: (draft, _ctx, facts) => initFirstPay(draft, facts),
  onAdvance: (draft) => {
    switch (stageOf(draft)) {
      case "entry":
        return chooseYes(draft);
      case "form":
        return submitEntry(draft, newUuidV4);
      case "split":
        return confirmSplit(draft);
      default:
        return null;
    }
  },
  finishOn: (draft) => finishAfter(draft),
  onBack: (draft) => backPatch(draft),
};
