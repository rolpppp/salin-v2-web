import { useState } from "react";
import fieldStyles from "@/components/field/field.module.css";
import { cn } from "@/lib/cn";
import { formatPeso, PLAN_BUCKETS, type PlanBucket } from "@/lib/money";
import { chooseCategoryBucket, initCategories } from "@/lib/onboarding/appPath";
import type { DraftBucket } from "@/lib/onboarding/draft";
import { bucketLabel } from "@/lib/onboarding/labels";
import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepBodyProps } from "@/lib/onboarding/step";
import { useOnboardingEnv } from "../env";
import styles from "./app-steps.module.css";

const noun = (n: number) => (n === 1 ? "category" : "categories");

function CategoriesBody({ draft, update }: StepBodyProps) {
  const { facts } = useOnboardingEnv();
  // Rows the user has just set stay in the "not sure" list while they're on this screen, so the list doesn't shift under them.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const cats = draft.categories ?? {};
  const info = new Map((facts?.expenseCategories ?? []).map((c) => [c.id, c]));
  const plan = draft.planA;
  const on: PlanBucket[] = plan ? PLAN_BUCKETS.filter((b) => plan[b] > 0) : [];
  const ids = Object.keys(cats).sort((a, b) => (info.get(a)?.name ?? "").localeCompare(info.get(b)?.name ?? ""));

  if (ids.length === 0) return <p className={styles.note}>You have no spending categories on your phone yet. New ones you add later go to Living until you move them in Plans.</p>;

  const unsure = ids.filter((id) => cats[id]?.notSure || touched.has(id));
  const sorted = ids.filter((id) => !unsure.includes(id));
  return (
    <>
      {unsure.length > 0 ? (
        <div className={styles.unsure}>
          {unsure.map((id) => {
            const c = cats[id];
            const meta = info.get(id);
            const name = meta?.name ?? "Category";
            return (
              <div key={id} className={styles.cat}>
                <span>
                  <b>{name}</b>
                  <small>{meta && meta.lastMonthSpendMinor > 0 ? `${formatPeso(meta.lastMonthSpendMinor)} last month` : "Nothing last month"}</small>
                </span>
                <div>
                  <label htmlFor={`ob-cat-${id}`} className="sr">
                    Bucket for {name}
                  </label>
                  <select
                    id={`ob-cat-${id}`}
                    className={cn(fieldStyles.control, fieldStyles.select)}
                    value={c?.bucket}
                    onChange={(e) => {
                      setTouched(new Set(touched).add(id));
                      const patch = chooseCategoryBucket(draft, id, e.target.value as DraftBucket);
                      if (patch) update(patch);
                    }}
                  >
                    {on.map((b) => (
                      <option key={b} value={b}>
                        {bucketLabel(b, draft)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className={styles.groups}>
        {on.map((b) => {
          const names = sorted.filter((id) => cats[id]?.bucket === b).map((id) => info.get(id)?.name ?? "Category");
          if (names.length === 0) return null;
          return (
            <div key={b} className={styles.group} style={{ "--c": `var(--b-${b})` } as React.CSSProperties}>
              <span className={styles.bn}>
                <i aria-hidden="true" />
                {bucketLabel(b, draft)}
              </span>
              <ul className={styles.pills} aria-label={`Categories in ${bucketLabel(b, draft)}`}>
                {names.map((n) => (
                  <li key={n} className={styles.pillCat}>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className={styles.note}>Move any category later in Plans. Moving one only changes where new spending goes.</p>
    </>
  );
}

/** SPEC §7.4 step 6. */
export const categoriesStep: ShellStepModule = {
  id: "cats",
  label: "Categories",
  question: (draft) => {
    const n = Object.keys(draft.categories ?? {}).length;
    return n === 0 ? "Your spending categories" : `We sorted your ${n} ${noun(n)} into buckets`;
  },
  reason: (draft) => {
    const unsure = Object.values(draft.categories ?? {}).filter((c) => c.notSure).length;
    return `So spending you log on your phone comes out of the right bucket.${unsure > 0 ? ` Check the ${unsure} we weren't sure about.` : ""}`;
  },
  Body: CategoriesBody,
  validate: () => null,
  enterWithFacts: (draft, _ctx, facts) => initCategories(draft, facts),
};
