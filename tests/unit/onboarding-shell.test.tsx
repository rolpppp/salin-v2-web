import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { emptyDraft, type OnboardingDraft } from "@/lib/onboarding/draft";
import { appDraft, ctx, facts as phoneFacts } from "@/lib/onboarding/testkit";
import { buildSources } from "@/lib/onboarding/web-path";

// A tiny router: the pathname is an external store, push/replace update it, so the shell re-renders like it would in Next.
const nav = vi.hoisted(() => {
  let path = "/welcome";
  const subs = new Set<() => void>();
  const api = {
    push: vi.fn(),
    replace: vi.fn(),
    get: () => path,
    set(p: string) {
      path = p;
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
  return api;
});
vi.mock("next/navigation", () => ({
  usePathname: () => useSyncExternalStore(nav.subscribe, nav.get, nav.get),
  useRouter: () => ({
    push: (p: string) => {
      nav.push(p);
      nav.set(p);
    },
    replace: (p: string) => {
      nav.replace(p);
      nav.set(p);
    },
  }),
}));

const actions = vi.hoisted(() => ({
  saveDraft: vi.fn(),
  finishOnboarding: vi.fn(),
  loadPhoneData: vi.fn(),
  trackOnboarding: vi.fn(),
}));
vi.mock("@/lib/actions/onboarding", () => actions);
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => null }));

import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

const USER = "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01";

function mount(over: { path?: string; draft?: OnboardingDraft; autoDetected?: boolean; facts?: ReturnType<typeof phoneFacts> | null; ctxOver?: Parameters<typeof ctx>[0] } = {}) {
  nav.set(over.path ?? "/welcome");
  return render(
    <LiveRegionProvider>
      <OnboardingFlow
        initialDraft={over.draft ?? emptyDraft()}
        initialCtx={ctx(over.ctxOver)}
        initialFacts={over.facts === undefined ? null : over.facts}
        autoDetected={over.autoDetected ?? false}
        userId={USER}
      />
    </LiveRegionProvider>,
  );
}

/** A web-path draft whose Income and Accounts answers are done, so the shell lets the person walk past them. */
const webAnswered = (step: OnboardingDraft["step"] = "income"): OnboardingDraft => ({
  ...emptyDraft(),
  path: "web",
  step,
  firstName: "Rolf",
  income: { kind: "salary", amountMinor: 2_500_000, frequency: "monthly", nextPayday: "2026-11-07", paidInOtherCurrency: false },
  accounts: [{ id: "w-bpi", name: "BPI", type: "bank", currency: "PHP", isNew: true }],
  landingAccountId: "w-bpi",
  sources: buildSources("salary", [], "w-bpi"),
});

const lastSaved = (): OnboardingDraft => actions.saveDraft.mock.calls.at(-1)![0] as OnboardingDraft;
const h1 = () => screen.getByRole("heading", { level: 1 });

beforeEach(() => {
  nav.push.mockClear();
  nav.replace.mockClear();
  for (const f of Object.values(actions)) f.mockReset();
  actions.saveDraft.mockResolvedValue({ ok: true });
  actions.trackOnboarding.mockResolvedValue(undefined);
  actions.loadPhoneData.mockResolvedValue({ ok: true, value: { facts: null, ctx: { lastMonthSpendMinor: null, phoneBills: null } } });
});
afterEach(() => vi.useRealTimers());

describe("Welcome (SPEC 7.1)", () => {
  it("asks what describes your money, with the example day hidden from assistive tech", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Know what's fine to spend today." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What describes your money?" })).toBeInTheDocument();
    const example = screen.getByText("Left to spend today").closest("[aria-hidden='true']");
    expect(example).not.toBeNull();
    expect(within(example as HTMLElement).getByText("₱320")).toBeInTheDocument();
  });

  it("'Salary or regular pay' starts the web path at Income and records the start", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Salary or regular pay/ }));
    expect(nav.push).toHaveBeenCalledWith("/welcome/income");
    expect(await screen.findByText("Step 1 of 6 · Income")).toBeInTheDocument();
    expect(actions.trackOnboarding).toHaveBeenCalledWith({ event: "onboarding_started", props: { path: "web", auto_detected: false } });
    await waitFor(() => expect(lastSaved()).toMatchObject({ path: "web", step: "income", pattern: "salary" }));
  });

  it("'Allowance or stipend' starts the short path at Accounts with Cash ticked, just tracking", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Allowance or stipend/ }));
    expect(nav.push).toHaveBeenCalledWith("/welcome/accounts");
    expect(await screen.findByText("Step 1 of 3 · Accounts")).toBeInTheDocument();
    await waitFor(() => expect(lastSaved()).toMatchObject({ path: "web", step: "accounts", pattern: "allowance", skipped: true }));
    expect(lastSaved().accounts.map((a: { name: string }) => a.name)).toEqual(["Cash"]);
  });

  it("'I use the Salin app' starts the app path at Your app", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /I already use the Salin app/ }));
    expect(nav.push).toHaveBeenCalledWith("/welcome/app");
    expect(await screen.findByText("Step 1 of 7 · Your app")).toBeInTheDocument();
  });

  it("synced rows skip the question (D-29): /welcome goes straight to Found your Salin data", async () => {
    mount({ autoDetected: true, facts: phoneFacts() });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/welcome/app"));
    expect(await screen.findByRole("heading", { level: 1, name: "Found your Salin data" })).toBeInTheDocument();
    expect(actions.trackOnboarding).toHaveBeenCalledWith({ event: "onboarding_started", props: { path: "app", auto_detected: true } });
    // No question was asked, so there is nothing to go Back to.
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("a first load resumes at draft.step", async () => {
    mount({ draft: webAnswered("accounts") });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/welcome/accounts"));
    expect(await screen.findByText("Step 2 of 6 · Accounts")).toBeInTheDocument();
  });
});

describe("shell (SPEC 7.2)", () => {
  const web = () => mount({ path: "/welcome/income", draft: webAnswered() });

  it("rail: Signed in pre-ticked, one pill per step, current marked, done checked", async () => {
    mount({ path: "/welcome/accounts", draft: webAnswered("accounts") });
    const rail = screen.getByRole("list", { name: "Setup steps" });
    const pills = within(rail).getAllByRole("listitem");
    expect(pills.map((p) => p.textContent)).toEqual(["Signed in", "Income, done", "2Accounts", "3Priorities", "4Your plan", "5Where it lives", "6First pay"]);
    expect(within(rail).getByText("Accounts").closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("kicker, question h1 and reason; the question gets focus on every step change", async () => {
    web();
    expect(screen.getByText("Step 1 of 6 · Income")).toBeInTheDocument();
    await waitFor(() => expect(h1()).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Step 2 of 6 · Accounts")).toBeInTheDocument();
    await waitFor(() => expect(h1()).toHaveTextContent("Where does your money sit?"));
    expect(h1()).toHaveFocus();
  });

  it("Enter submits (the primary is a submit button)", async () => {
    web();
    screen.getByRole("button", { name: "Continue" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Step 2 of 6 · Accounts")).toBeInTheDocument();
  });

  it("Income names the first problem and focuses that field; Accounts needs a landing account", async () => {
    mount({ path: "/welcome/income", draft: { ...emptyDraft(), path: "web", step: "income" } });
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Tell us what to call you");
    expect(screen.getByLabelText("What should we call you?")).toHaveFocus();
    await userEvent.type(screen.getByLabelText("What should we call you?"), "Rolf");
    await userEvent.type(screen.getByLabelText("About how much each time?"), "25000");
    await userEvent.type(screen.getByLabelText("Next one comes on"), "2026-11-07");
    await userEvent.click(screen.getByText("Gifts"));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Step 2 of 6 · Accounts")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick at least one place your money sits.");
    await userEvent.click(screen.getByRole("checkbox", { name: /^GCash/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick where your pay lands.");
    await userEvent.selectOptions(screen.getByLabelText("Your pay lands in"), "GCash");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Step 3 of 6 · Priorities")).toBeInTheDocument();
    await waitFor(() => expect(lastSaved()).toMatchObject({ accounts: [expect.objectContaining({ name: "GCash", isNew: true })], sources: [expect.objectContaining({ key: "main" }), expect.objectContaining({ key: "gift", rule: "ask" })] }));
  });

  it("Just tracking: First pay follows Priorities as step 4 of 4; Back returns to Priorities and undoes the skip", async () => {
    mount({ path: "/welcome/prio", draft: webAnswered("prio") });
    await userEvent.click(await screen.findByRole("button", { name: "Skip the plan, just track for now" }));
    expect(await screen.findByText("Step 4 of 4 · First pay")).toBeInTheDocument();
    await waitFor(() => expect(lastSaved()).toMatchObject({ skipped: true, planA: expect.objectContaining({ living: 100 }) }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Step 3 of 6 · Priorities")).toBeInTheDocument();
    expect(screen.queryByText(/Just tracking for now/)).not.toBeInTheDocument();
    await waitFor(() => expect(lastSaved()).toMatchObject({ skipped: false, planA: null, homes: null }));
  });

  it("Make a plan: the last step's primary reads Save my plan and Finish runs", async () => {
    actions.finishOnboarding.mockResolvedValue({ ok: true, value: { summary: null } });
    const planned: OnboardingDraft = { ...webAnswered("homes"), planOnly: true, priority: "safety" };
    mount({ path: "/welcome/homes", draft: planned });
    expect(await screen.findByText(/Make a plan · 3 of 3/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Save my plan/ }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/today"));
    expect(actions.finishOnboarding).toHaveBeenCalled();
  });

  it("Back keeps answers, and Back from the first step returns to the question", async () => {
    web();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Step 2 of 6 · Accounts");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Step 1 of 6 · Income")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Know what's fine to spend today." })).toBeInTheDocument();
    await waitFor(() => expect(lastSaved()).toMatchObject({ path: null, step: "welcome" }));
  });

  it("the plan slip sits beside the step: a line per answer, 'Fills in as you answer'", () => {
    mount({ path: "/welcome/income", draft: { ...emptyDraft(), path: "web", step: "income" } });
    const slip = screen.getByRole("group", { name: "Plan slip" });
    expect(within(slip).getByText("Comes in")).toBeInTheDocument();
    expect(within(slip).getAllByText("· · ·").length).toBeGreaterThan(5);
    expect(within(slip).getByText(/Fills in as you answer. Nothing is saved until you finish./)).toBeInTheDocument();
    expect(within(slip).queryByText("PLAN SET")).not.toBeInTheDocument();
  });

  it("a deep link past an unfinished step goes back to it", async () => {
    mount({ path: "/welcome/first", draft: appDraft({ step: "first" }) });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/welcome/app"));
  });

  it("a step that isn't on this path is sent to where the person was", async () => {
    mount({ path: "/welcome/cats", draft: webAnswered("accounts") });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/welcome/accounts"));
  });

  it("autosave failure shows an inline note and never blocks moving on", async () => {
    actions.saveDraft.mockResolvedValue({ ok: false, error: "x" });
    web();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument();
    expect(await screen.findByText("Step 2 of 6 · Accounts")).toBeInTheDocument();
  });

  it("saves nothing visible on success", async () => {
    web();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(actions.saveDraft).toHaveBeenCalled());
    expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument();
  });

  it("records each completed step with its path and seconds", async () => {
    web();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(actions.trackOnboarding).toHaveBeenCalledWith({ event: "onboarding_step_completed", props: { path: "web", step: "income", seconds_on_step: expect.any(Number) } });
  });
});

describe("app path to First pay", () => {
  const start = () => mount({ path: "/welcome/app", draft: emptyDraft(), autoDetected: true, facts: phoneFacts() });

  it("Found your Salin data: counts, every account ticked, the landing account locked", async () => {
    start();
    expect(await screen.findByRole("heading", { level: 1, name: "Found your Salin data" })).toBeInTheDocument();
    const stats = screen.getByRole("group", { name: "What we found on your phone" });
    expect(within(stats).getByText("3")).toBeInTheDocument();
    expect(within(stats).getByText("accounts")).toBeInTheDocument();
    expect(within(stats).getByText("categories")).toBeInTheDocument();
    expect(within(stats).getByText("7")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const b of boxes) expect(b).toBeChecked();
    const bdo = screen.getByRole("checkbox", { name: /BDO Savings/ });
    expect(bdo).toBeDisabled();
    expect(screen.getByText(/your pay lands here/)).toBeInTheDocument();
    await userEvent.click(bdo);
    expect(bdo).toBeChecked();
    expect(screen.getByText(/Nothing on your phone changes until you confirm/)).toBeInTheDocument();
  });

  it("an account can be left out and the slip counts the ones left in", async () => {
    start();
    await userEvent.click(await screen.findByRole("checkbox", { name: /GCash/ }));
    expect(screen.getByRole("checkbox", { name: /GCash/ })).not.toBeChecked();
    const slip = screen.getByRole("group", { name: "Plan slip" });
    expect(within(slip).getByText("Accounts").parentElement).toHaveTextContent("2");
  });

  async function toIncome() {
    start();
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { level: 1, name: "Here's the money we found coming in" });
  }

  it("Income: detected sources with recent amounts, cadence, one main pay, rules prefilled from kind", async () => {
    await toIncome();
    expect(screen.getByText("Step 2 of 7 · Income")).toBeInTheDocument();
    expect(screen.getByText(/₱25,000.00 Oct 7 · ₱25,000.00 Sep 7 · ₱25,000.00 Aug 7/)).toBeInTheDocument();
    expect(screen.getByText("Monthly · your main pay")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio", { name: /Salary|DOST Stipend/ });
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([true, false]);
    expect(screen.getByLabelText("Rule for Salary")).toBeDisabled();
    expect(screen.getByLabelText("Rule for DOST Stipend")).toHaveValue("whole");
    expect(screen.getByText("DOST Stipend is kept whole in Scholarship, so it's never split.")).toBeInTheDocument();
    expect(screen.getByLabelText("Next main payday")).toHaveValue("2026-11-07");
    // The slip printed the main pay.
    const slip = screen.getByRole("group", { name: "Plan slip" });
    expect(within(slip).getByText("₱25,000.00")).toBeInTheDocument();
    expect(within(slip).getByText("BDO Savings")).toBeInTheDocument();
  });

  it("exactly one main pay: choosing another un-chooses the first; its rule select locks, the old one frees up", async () => {
    await toIncome();
    await userEvent.click(screen.getByRole("radio", { name: /DOST Stipend/ }));
    const radios = screen.getAllByRole("radio", { name: /Salary|DOST Stipend/ });
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([false, true]);
    expect(screen.getByLabelText("Rule for DOST Stipend")).toBeDisabled();
    expect(screen.getByLabelText("Rule for Salary")).not.toBeDisabled();
  });

  it("radio groups use arrow keys", async () => {
    await toIncome();
    screen.getByRole("radio", { name: /Salary/ }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /DOST Stipend/ })).toBeChecked();
  });

  it("an empty payday is explained, announced in the alert, and focus goes to the field", async () => {
    await toIncome();
    await userEvent.click(screen.getByRole("radio", { name: /DOST Stipend/ })); // seen once: no payday guess
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Add the date of your next main payday.");
    expect(screen.getByLabelText("Next main payday")).toHaveFocus();
    expect(screen.getByLabelText("Next main payday")).toHaveAttribute("aria-invalid", "true");
    // Typing a valid date clears the error.
    await userEvent.type(screen.getByLabelText("Next main payday"), "2026-10-30");
    expect(alert).toBeEmptyDOMElement();
  });

  it("a payday in the past is refused", async () => {
    await toIncome();
    const input = screen.getByLabelText("Next main payday");
    await userEvent.clear(input);
    await userEvent.type(input, "2026-10-01");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a payday that's today or later.");
  });

  it("Back keeps the answers given on a later step", async () => {
    await toIncome();
    await userEvent.click(screen.getByRole("radio", { name: /DOST Stipend/ }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { level: 1, name: "Found your Salin data" });
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { level: 1, name: "Here's the money we found coming in" });
    expect(screen.getByRole("radio", { name: /DOST Stipend/ })).toBeChecked();
  });

  /** The shell's primary submit (its label depends on the step: "Continue", "See my plan", …). */
  const primary = () => {
    const el = document.getElementById("ob-primary");
    if (!el) throw new Error("no primary button");
    return el;
  };

  async function toFirstPay() {
    await toIncome();
    await userEvent.click(primary());
    await screen.findByRole("heading", { level: 1, name: "What should your money do first?" });
    await userEvent.click(screen.getByRole("radio", { name: /Build a safety net/ }));
    // The suggested plan totals 100, homes and categories come pre-filled, so the primary walks through.
    for (const q of [/^Here's a plan for your/, /^Where should each bucket live\?/, /^(We sorted your|Your spending categories)/]) {
      await userEvent.click(primary());
      await screen.findByRole("heading", { level: 1, name: q });
    }
    await userEvent.click(primary());
    await screen.findByRole("heading", { level: 1, name: "Your Oct 7 pay is waiting for a job" });
  }

  it("First pay: the waiting pay, its account and amount, other income waiting, Give it a job / Do it later", async () => {
    await toFirstPay();
    expect(screen.getByText("Step 7 of 7 · First pay")).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("Oct 7 · landed in BDO Savings")).toBeInTheDocument();
    expect(screen.getByText("₱25,000.00", { selector: "b" })).toBeInTheDocument();
    expect(screen.getByText(/₱7,000.00 from 1 more income is in Money in too: DOST Stipend \(kept whole in Scholarship\)\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do it later" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Give it a job" })).toBeInTheDocument();
  });

  it("Give it a job opens the split stage: the choice is staged, nothing is finished, Back returns to the question", async () => {
    await toFirstPay();
    await userEvent.click(screen.getByRole("button", { name: "Give it a job" }));
    expect(await screen.findByRole("heading", { level: 1, name: "₱25,000.00 from Salary, split by your plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm split" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Plan slip" })).not.toHaveTextContent("PLAN SET");
    await waitFor(() => expect(lastSaved().firstPay).toMatchObject({ choice: "yes", entryId: "sal-oct", amountMinor: 2_500_000, date: "2026-10-07", splitConfirmed: false }));
    expect(actions.finishOnboarding).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your Oct 7 pay is waiting for a job" })).toBeInTheDocument();
  });

  it("split, confirm, move: ticking every transfer finishes and shows the Done card in place", async () => {
    actions.finishOnboarding.mockResolvedValue({
      ok: true,
      value: { summary: { splitMinor: 2_500_000, splitBucketsCount: 6, transfersCount: 2, transfersTicked: 2, safeToSpendMinor: 1_150_000, emergencyLeftMinor: 625_000, spendingBeforeMinor: 50_000 } },
    });
    await toFirstPay();
    await userEvent.click(screen.getByRole("button", { name: "Give it a job" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirm split" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Now move the money" })).toBeInTheDocument();
    expect(actions.finishOnboarding).not.toHaveBeenCalled(); // confirming is staged
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
    expect(screen.getByText(`0 of ${boxes.length} sent`)).toBeInTheDocument();
    await waitFor(() => expect(boxes[0]).toHaveFocus());
    for (const box of boxes) await userEvent.click(box);
    const card = await screen.findByTestId("onboarding-done");
    expect(card).toHaveAttribute("data-burst", "onboarding");
    expect(within(card).getByRole("heading", { name: "Every peso has a home." })).toHaveFocus();
    expect(card).toHaveTextContent("Safe to spend until");
    expect(card).toHaveTextContent("₱11,500.00, after what you've already spent");
    expect(within(card).getByRole("link", { name: /Open Today/ })).toHaveAttribute("href", "/today?grow=onboarding&tour=1");
    expect(screen.getByRole("group", { name: "Plan slip" })).toHaveTextContent("PLAN SET");
    expect(nav.push).not.toHaveBeenCalledWith(expect.stringMatching(/^\/today/));
    expect(lastSaved().firstPay).toMatchObject({ choice: "yes", splitConfirmed: true });
    expect(lastSaved().firstPay.ticked).toHaveLength(boxes.length);
    expect(actions.trackOnboarding).toHaveBeenCalledWith({ event: "onboarding_completed", props: expect.objectContaining({ path: "app", first_pay: "confirmed", transfers_ticked: boxes.length }) });
    expect(actions.trackOnboarding.mock.calls.filter(([e]) => e.event === "onboarding_completed")).toHaveLength(1);
  });

  it("I'll send them later finishes with the transfers left open and goes to Today", async () => {
    actions.finishOnboarding.mockResolvedValue({ ok: true, value: { summary: null } });
    await toFirstPay();
    await userEvent.click(screen.getByRole("button", { name: "Give it a job" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirm split" }));
    await userEvent.click(await screen.findByRole("button", { name: "I'll send them later" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/today?tour=1"));
    expect(lastSaved().firstPay).toMatchObject({ choice: "yes", splitConfirmed: true, ticked: [] });
    expect(screen.queryByTestId("onboarding-done")).not.toBeInTheDocument();
  });

  it("Do it later shows the reminder choice; Open Today saves the choice, finishes, and opens Today", async () => {
    actions.finishOnboarding.mockResolvedValue({ ok: true, value: { summary: null } });
    await toFirstPay();
    await userEvent.click(screen.getByRole("button", { name: "Do it later" }));
    expect(await screen.findByRole("heading", { level: 1, name: "That's fine. Payday is the moment." })).toBeInTheDocument();
    expect(screen.getByText(/Your pay waits in Money in/)).toBeInTheDocument();
    expect(actions.finishOnboarding).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("radio", { name: "No reminder" }));
    await userEvent.click(screen.getByRole("button", { name: "Open Today" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/today?tour=1"));
    // The stored draft the SQL reads has the choice and reminder, and it was saved before finishing was called.
    expect(lastSaved().firstPay).toMatchObject({ choice: "later", reminder: "none" });
    expect(actions.saveDraft.mock.invocationCallOrder.at(-1)!).toBeLessThan(actions.finishOnboarding.mock.invocationCallOrder[0]!);
    expect(actions.trackOnboarding).toHaveBeenCalledWith({ event: "onboarding_completed", props: expect.objectContaining({ first_pay: "later", transfers_ticked: 0 }) });
  });

  it("if Finish fails the message shows above the buttons and the person stays on the step", async () => {
    actions.finishOnboarding.mockResolvedValue({ ok: false, error: "Pick one main pay." });
    await toFirstPay();
    await userEvent.click(screen.getByRole("button", { name: "Do it later" }));
    await userEvent.click(await screen.findByRole("button", { name: "Open Today" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick one main pay.");
    expect(nav.push).not.toHaveBeenCalledWith(expect.stringMatching(/^\/today/));
    expect(screen.getByRole("button", { name: "Open Today" })).toBeInTheDocument();
    expect(actions.trackOnboarding).not.toHaveBeenCalledWith(expect.objectContaining({ event: "onboarding_completed" }));
  });
});

describe("Waiting for your phone (SPEC 7.4 step 1)", () => {
  it("shows the three steps and a live status, with Continue disabled and an exit to the web path", async () => {
    mount({ path: "/welcome/app", draft: appDraft(), facts: null });
    expect(await screen.findByRole("heading", { level: 1, name: "Turn on sync in the Salin app" })).toBeInTheDocument();
    expect(screen.getByText("Settings › Sync")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for your phone…");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(actions.trackOnboarding).toHaveBeenCalledWith({ event: "sync_prompt_shown", props: { seconds_waited: 0 } });
  });

  it("polls every 10 s; when rows arrive it announces, tracks sync_connected and shows the counts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount({ path: "/welcome/app", draft: appDraft(), facts: null });
    await screen.findByText("Waiting for your phone…");
    actions.loadPhoneData.mockResolvedValue({ ok: true, value: { facts: phoneFacts(), ctx: { lastMonthSpendMinor: {}, phoneBills: null } } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Found your Salin data" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(actions.trackOnboarding).toHaveBeenCalledWith({ event: "sync_connected", props: { seconds_waited: expect.any(Number) } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Continue without the app" })).not.toBeInTheDocument();
  });

  it("Continue without the app starts the web path from scratch", async () => {
    mount({ path: "/welcome/app", draft: appDraft({ firstName: "Old" }), facts: null });
    await userEvent.click(await screen.findByRole("button", { name: "Continue without the app" }));
    expect(nav.push).toHaveBeenCalledWith("/welcome/income");
    expect(await screen.findByText("Step 1 of 6 · Income")).toBeInTheDocument();
    await waitFor(() => expect(lastSaved()).toMatchObject({ path: "web", step: "income", firstName: null, sources: [expect.objectContaining({ key: "main", isMain: true })], accounts: [] }));
  });
});
