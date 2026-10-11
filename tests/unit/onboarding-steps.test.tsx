import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { homesStep } from "@/components/onboarding/steps/WhereItLives";
import { planStep } from "@/components/onboarding/steps/YourPlan";
import { prioStep } from "@/components/onboarding/steps/Priorities";
import { emptyDraft } from "@/lib/onboarding/draft";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import type { StepContext, StepModule } from "@/lib/onboarding/step";
import { newProbe, StepHarness } from "./support/stepHarness";

const ctx: StepContext = { path: "web", todayIso: "2026-10-12", homeCurrency: "PHP", lastMonthSpendMinor: null, phoneBills: null };
const acct = (id: string, name: string, type: OnboardingDraft["accounts"][number]["type"]) => ({ id, name, type, currency: "PHP" as const, isNew: true });

function draftWith(over: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    ...emptyDraft(),
    path: "web",
    income: { kind: "salary", amountMinor: 2_500_000, frequency: "twice", nextPayday: "2026-10-21", paidInOtherCurrency: false },
    priority: "safety",
    billsMinor: 600_000,
    billKinds: ["rent"],
    accounts: [acct("gcash", "GCash", "eWallet"), acct("bpi", "BPI", "bank"), acct("maya", "Maya", "eWallet"), acct("tonik", "Tonik", "savings"), acct("mp2", "Pag-IBIG MP2", "investment")],
    landingAccountId: "bpi",
    ...over,
  };
}

function setup(step: StepModule, initial: OnboardingDraft, c: StepContext = ctx) {
  const { probe, hooks } = newProbe();
  render(<StepHarness step={step} initial={initial} ctx={c} hooks={hooks} />);
  return probe;
}

describe("Priorities", () => {
  it("requires a priority, then a goal name and cost", async () => {
    const probe = setup(prioStep, draftWith({ priority: null }));
    await userEvent.click(screen.getByRole("button", { name: "See my plan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick what you want your money to do first.");
    await userEvent.click(screen.getByRole("radio", { name: /Save for something/ }));
    await userEvent.click(screen.getByRole("button", { name: "See my plan" }));
    expect(probe.error?.field).toBe("prio-goal-name");
    await userEvent.type(screen.getByLabelText("What are you saving for?"), "New laptop");
    await userEvent.click(screen.getByRole("button", { name: "See my plan" }));
    expect(probe.error?.field).toBe("prio-goal-cost");
    await userEvent.type(screen.getByLabelText("How much does it cost?"), "50,000");
    await userEvent.click(screen.getByRole("button", { name: "See my plan" }));
    expect(probe.submits).toBe(1);
    expect(probe.draft.goal).toEqual({ name: "New laptop", costMinor: 5_000_000 });
  });

  it("shows the later toggle only with bills, defaulting to 2027-01-01", async () => {
    const probe = setup(prioStep, draftWith({ billsMinor: 0, billKinds: [] }));
    expect(screen.queryByText("These start later")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Fixed bills each month"), "2000");
    expect(probe.draft.billsMinor).toBe(200_000);
    await userEvent.click(screen.getByLabelText(/These start later/));
    expect(probe.draft.billsStart).toBe("2027-01-01");
    expect(screen.getByLabelText("Bills start on")).toHaveValue("2027-01-01");
    await userEvent.click(screen.getByRole("checkbox", { name: "Rent" }));
    expect(probe.draft.billKinds).toEqual(["rent"]);
  });

  it("prefills bills from the phone on the app path", () => {
    const probe = setup(prioStep, draftWith({ billsMinor: 0, billKinds: [] }), { ...ctx, path: "app", phoneBills: { totalMinor: 200_000, startsOn: "2027-01-01" } });
    expect(probe.draft.billsMinor).toBe(200_000);
    expect(screen.getByLabelText("Fixed bills each month")).toHaveValue("2,000");
    expect(screen.getByLabelText("Bills start on")).toHaveValue("2027-01-01");
  });

  it("Skip sets the just-track plan and submits the form; picking a priority undoes it", async () => {
    const probe = setup(prioStep, draftWith({ priority: null }));
    await userEvent.click(screen.getByRole("button", { name: "Skip the plan, just track for now" }));
    expect(probe.draft.skipped).toBe(true);
    expect(probe.draft.planA?.living).toBe(100);
    expect(probe.draft.planBOn).toBe(false);
    expect(probe.submits).toBe(1);
    await userEvent.click(screen.getByRole("radio", { name: /Grow it for later/ }));
    expect(probe.draft.skipped).toBe(false);
    expect(probe.draft.priority).toBe("grow");
  });
});

describe("Your plan", () => {
  it("renders the question, rows and the 100% status", () => {
    const probe = setup(planStep, draftWith());
    expect(screen.getByRole("heading", { name: "Here's a plan for your ₱25,000 pay" })).toBeInTheDocument();
    expect(screen.getByText(/^100% ·/)).toBeInTheDocument();
    expect(probe.draft.planA?.emergency).toBe(25);
    expect(screen.getByText("₱9,500.00")).toBeInTheDocument(); // Living per pay
    expect(screen.getByText("≈ ₱19,000.00 a month")).toBeInTheDocument();
  });

  it("stepper buttons and the arrow keys change whole percents; the total status says what is missing", async () => {
    const probe = setup(planStep, draftWith());
    await userEvent.click(screen.getByRole("button", { name: "Less to Fun money" }));
    expect(probe.draft.planA?.fun).toBe(9);
    expect(probe.draft.planEdited).toBe(true);
    expect(screen.getByText("99% · 1% still needs a job")).toBeInTheDocument();
    const field = screen.getByLabelText("Fun money percent");
    field.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(probe.draft.planA?.fun).toBe(10);
    expect(screen.getByText(/^100% ·/)).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, "5");
    expect(probe.draft.planA?.fun).toBe(5);
    await userEvent.click(screen.getByRole("button", { name: "Use this plan" }));
    expect(probe.error?.field).toBe("plan-total");
    expect(screen.getByRole("alert")).toHaveTextContent("95%");
    expect(probe.submits).toBe(0);
  });

  it("switching preset replaces edits and announces it", async () => {
    const probe = setup(planStep, draftWith());
    await userEvent.click(screen.getByRole("button", { name: "Less to Fun money" }));
    await userEvent.click(screen.getByRole("radio", { name: "50/30/20" }));
    expect(probe.announcements).toContain("Switched to 50/30/20. Your edits were replaced.");
    expect(probe.draft.planEdited).toBe(false);
    expect(probe.draft.planA?.fun).toBe(30);
  });

  it("re-suggests and announces when answers changed under edits", () => {
    const edited = draftWith({ planA: { living: 38, rent: 12, fun: 15, emergency: 20, invest: 5, sinking: 10, tax: 0, buffer: 0 }, planEdited: true, planInputsSig: "old" });
    const probe = setup(planStep, edited);
    expect(probe.announcements).toEqual(["Your answers changed, so the plan was suggested again."]);
    expect(probe.draft.planA?.emergency).toBe(25);
    expect(probe.draft.planEdited).toBe(false);
  });

  it("offers Plan B and the target only when Emergency is at least 10%", async () => {
    const probe = setup(planStep, draftWith());
    expect(screen.getByLabelText(/Switch to Plan B/)).toBeChecked();
    expect(screen.getByLabelText("Safety net target")).toHaveValue("75,000");
    await userEvent.click(screen.getByLabelText(/Switch to Plan B/));
    expect(probe.draft.planBOn).toBe(false);
    expect(screen.queryByLabelText("Safety net target")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Emergency fund percent"));
    await userEvent.type(screen.getByLabelText("Emergency fund percent"), "5");
    expect(screen.queryByLabelText(/Switch to Plan B/)).not.toBeInTheDocument();
  });

  it("shows the bills warning in words as well as colour", () => {
    setup(planStep, draftWith({ income: { kind: "salary", amountMinor: 3_000_000, frequency: "monthly", nextPayday: "2026-10-21", paidInOtherCurrency: false }, billsMinor: 2_000_000, priority: "control" }));
    expect(screen.getByText(/Your bills are ₱20,000 a month, but Rent gets about ₱13,500/)).toBeInTheDocument();
    expect(screen.getByText("Short.")).toBeInTheDocument();
  });

  it("bills that start later: the row says where the share goes", () => {
    setup(planStep, draftWith({ billsStart: "2027-01-01" }));
    expect(screen.getByText("to Emergency until Jan 1, 2027")).toBeInTheDocument();
  });

  it("adds a hidden bucket", async () => {
    const probe = setup(planStep, draftWith());
    await userEvent.click(screen.getByRole("button", { name: "+ Tax set-aside" }));
    expect(screen.getByLabelText("Tax set-aside percent")).toHaveValue(0);
    await userEvent.click(screen.getByRole("button", { name: "More to Tax set-aside" }));
    expect(probe.draft.planA?.tax).toBe(1);
  });
});

describe("Where it lives", () => {
  it("pre-fills homes, previews payday and counts transfers; a chosen home is kept", async () => {
    const d = draftWith();
    const probe = setup(homesStep, { ...d, ...planStep.onEnter?.(d, ctx) });
    expect(screen.getByLabelText("Living lives in")).toHaveValue("gcash");
    expect(screen.getByLabelText("Emergency fund lives in")).toHaveValue("tonik");
    expect(screen.getByText("4 transfers each payday. Fewer homes means fewer transfers.")).toBeInTheDocument();
    expect(screen.getByText("Keep ₱3,000.00 in BPI")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Fun money lives in"), "gcash");
    expect(probe.draft.homesUserSet).toEqual(["fun"]);
    expect(screen.getByText("3 transfers each payday. Fewer homes means fewer transfers.")).toBeInTheDocument();
    expect(within(screen.getAllByRole("list").at(-1) as HTMLElement).getAllByText(/^Send /)).toHaveLength(3);
  });

  it("just-track drafts keep everything in the landing account", () => {
    setup(homesStep, draftWith({ skipped: true, planA: { living: 100, rent: 0, fun: 0, emergency: 0, invest: 0, sinking: 0, tax: 0, buffer: 0 } }));
    expect(screen.getByText("No transfers needed: everything stays where it lands.")).toBeInTheDocument();
    expect(screen.getByText("Keep ₱25,000.00 in BPI")).toBeInTheDocument();
  });
});
