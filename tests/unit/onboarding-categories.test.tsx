import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingEnvContext } from "@/components/onboarding/env";
import { categoriesStep } from "@/components/onboarding/steps/Categories";
import { initCategories } from "@/lib/onboarding/appPath";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import { appDraft, ctx, facts as phoneFacts, plan } from "@/lib/onboarding/testkit";

const noEnv = { userId: "u", refreshPhone: async () => true, track: vi.fn(), switchToWeb: vi.fn(), finishLater: vi.fn(), finish: async () => {}, finishing: false };

/** Holds the draft like the shell does, so a change re-renders the step. */
function Harness({ initial, onDraft }: { initial: OnboardingDraft; onDraft?: (d: OnboardingDraft) => void }) {
  const [draft, setDraft] = useState(initial);
  const Body = categoriesStep.Body;
  return (
    <OnboardingEnvContext.Provider value={{ ...noEnv, facts: phoneFacts() }}>
      <h1>{categoriesStep.question(draft, ctx())}</h1>
      <p>{categoriesStep.reason(draft, ctx())}</p>
      <Body
        draft={draft}
        ctx={ctx()}
        errorField={null}
        announce={() => {}}
        update={(patch) => {
          const next = { ...draft, ...patch };
          setDraft(next);
          onDraft?.(next);
        }}
      />
    </OnboardingEnvContext.Provider>
  );
}

const entered = (over: Partial<OnboardingDraft> = {}): OnboardingDraft => {
  const base = appDraft({ planA: plan(), ...over });
  return { ...base, ...initCategories(base, phoneFacts()) };
};

describe("Categories step (SPEC 7.4 step 6, BR 12.5)", () => {
  it("says how many it sorted and how many it wasn't sure about", () => {
    render(<Harness initial={entered()} />);
    expect(screen.getByRole("heading", { name: "We sorted your 3 categories into buckets" })).toBeInTheDocument();
    expect(screen.getByText(/Check the 1 we weren't sure about\./)).toBeInTheDocument();
  });

  it("lists the not-sure ones first, each with a bucket select and last month's spend", () => {
    render(<Harness initial={entered()} />);
    const select = screen.getByLabelText("Bucket for Misc");
    expect(select).toHaveValue("living");
    expect(screen.getByText("₱300.00 last month")).toBeInTheDocument();
    // Only buckets that are on in the plan are offered.
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Living", "Bills", "Fun", "Emergency", "Investments", "Sinking funds"]);
  });

  it("the sure ones show as pills grouped by bucket", () => {
    render(<Harness initial={entered()} />);
    const living = screen.getByRole("list", { name: "Categories in Living" });
    expect(within(living).getByText("Groceries")).toBeInTheDocument();
    const fun = screen.getByRole("list", { name: "Categories in Fun" });
    expect(within(fun).getByText("Movies")).toBeInTheDocument();
    // Buckets with nothing in them don't show.
    expect(screen.queryByRole("list", { name: "Categories in Bills" })).not.toBeInTheDocument();
  });

  it("choosing a bucket keeps the row where it is, and stores it as the user's own", async () => {
    let last: OnboardingDraft | null = null;
    render(<Harness initial={entered()} onDraft={(d) => (last = d)} />);
    await userEvent.selectOptions(screen.getByLabelText("Bucket for Misc"), "sinking");
    expect(screen.getByLabelText("Bucket for Misc")).toHaveValue("sinking");
    expect(last!.categories!["c-misc"]).toEqual({ bucket: "sinking", source: "user", notSure: false });
  });

  it("a plan with a bucket turned off only offers the buckets that are on", () => {
    render(<Harness initial={entered({ planA: plan({ fun: 0, living: 50 }) })} />);
    // Movies went back to not sure with Fun off.
    const select = screen.getByLabelText("Bucket for Movies");
    expect(within(select).queryByRole("option", { name: "Fun" })).not.toBeInTheDocument();
    expect(select).toHaveValue("living");
  });
});
