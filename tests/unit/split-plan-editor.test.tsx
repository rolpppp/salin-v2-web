import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { RulesCard } from "@/components/plans/split/RulesCard";
import { SplitPlanEditor, type SplitActions } from "@/components/plans/split/SplitPlanEditor";
import type { SplitPlanData } from "@/lib/data/plans";

vi.mock("@/lib/actions/plans", () => ({ saveSplitPlan: vi.fn(), setBucketKeptIn: vi.fn(), setPlanSwitchTarget: vi.fn() }));

const data: SplitPlanData = {
  buckets: [
    { id: "b-living", name: "Living", shortName: "Living", hue: "living", note: "Everyday costs", planless: false, keptInAccountId: "acc-1" },
    { id: "b-em", name: "Emergency fund", shortName: "Emergency", hue: "emergency", note: "Safety net", planless: false, keptInAccountId: "acc-1" },
    { id: "b-fun", name: "Fun", shortName: "Fun", hue: "fun", note: "Treats", planless: false, keptInAccountId: "acc-2" },
    { id: "b-dost", name: "Scholarship", shortName: "Scholarship", hue: "dost", note: null, planless: true, keptInAccountId: "acc-1" },
  ],
  accounts: [
    { id: "acc-1", name: "MariBank", isArchived: false },
    { id: "acc-2", name: "GCash", isArchived: false },
  ],
  plans: [
    { key: "A", name: "Plan A", lines: { "b-living": 5000, "b-em": 3000, "b-fun": 2000 } },
    { key: "B", name: "Plan B", lines: { "b-living": 6000, "b-em": 2000, "b-fun": 2000 } },
  ],
  activePlan: "A",
  switchRule: { targetMinor: 5_000_000, nowMinor: 1_234_500, bucketName: "Emergency fund", toPlan: "B" },
  redirectRule: { fromBucketName: "Rent", toBucketName: "Emergency fund", untilDate: "2027-01-01" },
};

function actions(over: Partial<SplitActions> = {}): SplitActions {
  return { savePlan: vi.fn().mockResolvedValue({ ok: true }), setKeptIn: vi.fn().mockResolvedValue({ ok: true }), ...over };
}

describe("SplitPlanEditor", () => {
  it("shows the active plan, a row per planned bucket, totals, and the planless bucket below", () => {
    render(<SplitPlanEditor data={data} actions={actions()} />);
    expect(screen.getByTestId("active-plan")).toHaveTextContent("Plan A is active");
    expect(screen.getByLabelText("Living Plan A percent")).toHaveValue("50");
    expect(screen.getByLabelText("Fun Plan B percent")).toHaveValue("20");
    expect(screen.getByTestId("total-A")).toHaveTextContent("100%");
    expect(screen.queryByLabelText("Scholarship Plan A percent")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scholarship is kept in")).toHaveValue("acc-1");
    expect(screen.getByText(/Both plans add up to 100%/)).toBeInTheDocument();
  });

  it("refuses a total that is not 100: nothing is sent, the message says how to fix it, and the last saved plan stays", async () => {
    const a = actions();
    render(<SplitPlanEditor data={data} actions={a} />);
    const living = screen.getByLabelText("Living Plan A percent");
    await userEvent.clear(living);
    await userEvent.type(living, "45");
    await userEvent.tab();
    expect(a.savePlan).not.toHaveBeenCalled();
    expect(screen.getByTestId("total-A")).toHaveTextContent("95%");
    expect(screen.getByTestId("total-A")).toHaveTextContent("needs 100%");
    const msgs = screen.getByTestId("plan-messages");
    expect(msgs).toHaveTextContent("Plan A adds up to 95%. Add 5% to another bucket.");
    expect(msgs).toHaveTextContent("Not saved yet: your last saved Plan A is still used for new paydays.");
  });

  it("saves once the plan adds to 100, in basis points, for that plan only", async () => {
    const a = actions();
    render(
      <LiveRegionProvider>
        <SplitPlanEditor data={data} actions={a} />
      </LiveRegionProvider>,
    );
    const living = screen.getByLabelText("Living Plan A percent");
    await userEvent.clear(living);
    await userEvent.type(living, "45");
    await userEvent.tab();
    const em = screen.getByLabelText("Emergency fund Plan A percent");
    await userEvent.clear(em);
    await userEvent.type(em, "35");
    await userEvent.tab();
    expect(a.savePlan).toHaveBeenCalledTimes(1);
    expect(a.savePlan).toHaveBeenCalledWith("A", [
      { bucketId: "b-living", percentBp: 4500 },
      { bucketId: "b-em", percentBp: 3500 },
      { bucketId: "b-fun", percentBp: 2000 },
    ]);
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Plan A saved. It applies to paydays from now on; past paydays stay as they were."));
  });

  it("does not save when nothing changed, or for a non-number", async () => {
    const a = actions();
    render(<SplitPlanEditor data={data} actions={a} />);
    const fun = screen.getByLabelText("Fun Plan A percent");
    await userEvent.click(fun);
    await userEvent.tab();
    expect(a.savePlan).not.toHaveBeenCalled();
    await userEvent.clear(fun);
    await userEvent.type(fun, "12.5");
    await userEvent.tab();
    expect(a.savePlan).not.toHaveBeenCalled();
    expect(fun).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("plan-messages")).toHaveTextContent("Fun needs a whole number from 0 to 100 in Plan A.");
  });

  it("a failed write restores the last saved numbers and says so", async () => {
    const a = actions({ savePlan: vi.fn().mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." }) });
    render(<SplitPlanEditor data={data} actions={a} />);
    const living = screen.getByLabelText("Living Plan A percent");
    await userEvent.clear(living);
    await userEvent.type(living, "40");
    await userEvent.tab();
    const fun = screen.getByLabelText("Fun Plan A percent");
    await userEvent.clear(fun);
    await userEvent.type(fun, "30");
    await userEvent.tab();
    expect(await screen.findByText(/Couldn't save\. Check your connection and try again\. Plan A is back to its last saved numbers\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Living Plan A percent")).toHaveValue("50");
    expect(screen.getByLabelText("Fun Plan A percent")).toHaveValue("20");
  });

  it("changing Kept in saves at once; a failure puts the old account back at the control", async () => {
    const a = actions();
    const { rerender } = render(<SplitPlanEditor data={data} actions={a} />);
    await userEvent.selectOptions(screen.getByLabelText("Fun is kept in"), "acc-1");
    expect(a.setKeptIn).toHaveBeenCalledWith("b-fun", "acc-1");
    expect(screen.getByLabelText("Fun is kept in")).toHaveValue("acc-1");

    const failing = actions({ setKeptIn: vi.fn().mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." }) });
    rerender(<SplitPlanEditor data={data} actions={failing} />);
    await userEvent.selectOptions(screen.getByLabelText("Living is kept in"), "acc-2");
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Living is kept in")).toHaveValue("acc-1");
  });

  it("keeps focus in the field while typing (no remount)", async () => {
    render(<SplitPlanEditor data={data} actions={actions()} />);
    const living = screen.getByLabelText("Living Plan A percent");
    await userEvent.click(living);
    await userEvent.keyboard("{End}1");
    expect(living).toHaveFocus();
  });

  it("works with one plan", () => {
    render(<SplitPlanEditor data={{ ...data, plans: [data.plans[0]], switchRule: null }} actions={actions()} />);
    expect(screen.queryByLabelText("Fun Plan B percent")).not.toBeInTheDocument();
    expect(screen.getByText(/Your plan adds up to 100%/)).toBeInTheDocument();
  });
});

describe("RulesCard", () => {
  it("shows the switch amount, the same measure as 'Now', and the rent redirect", () => {
    render(<RulesCard switchRule={data.switchRule} redirectRule={data.redirectRule} setTarget={vi.fn()} />);
    expect(screen.getByLabelText("Plan B switch amount")).toHaveValue("50,000");
    expect(screen.getByTestId("switch-now")).toHaveTextContent("₱12,345.00");
    expect(screen.getByTestId("redirect-rule")).toHaveTextContent("Rent’s share goes to Emergency fund until January 1, 2027.");
    expect(screen.getByText(/only affects paydays after the change/)).toBeInTheDocument();
  });

  it("saves a new amount in centavos on blur", async () => {
    const setTarget = vi.fn().mockResolvedValue({ ok: true });
    render(<RulesCard switchRule={data.switchRule} redirectRule={null} setTarget={setTarget} />);
    const input = screen.getByLabelText("Plan B switch amount");
    await userEvent.clear(input);
    await userEvent.type(input, "75,000.50");
    await userEvent.tab();
    expect(setTarget).toHaveBeenCalledWith(7_500_050);
    expect(input).toHaveValue("75,000.50");
  });

  it("refuses zero, text and too-large amounts without calling the server", async () => {
    const setTarget = vi.fn();
    render(<RulesCard switchRule={data.switchRule} redirectRule={null} setTarget={setTarget} />);
    const input = screen.getByLabelText("Plan B switch amount");
    for (const bad of ["0", "abc", "20,000,000"]) {
      await userEvent.clear(input);
      await userEvent.type(input, bad);
      await userEvent.tab();
      expect(screen.getByText("Enter an amount above ₱0 and up to ₱10,000,000.")).toBeInTheDocument();
    }
    expect(setTarget).not.toHaveBeenCalled();
  });

  it("puts the old amount back when the save fails", async () => {
    const setTarget = vi.fn().mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." });
    render(<RulesCard switchRule={data.switchRule} redirectRule={null} setTarget={setTarget} />);
    const input = screen.getByLabelText("Plan B switch amount");
    await userEvent.clear(input);
    await userEvent.type(input, "60000");
    await userEvent.tab();
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument();
    expect(input).toHaveValue("50,000");
  });

  it("says so when there is no Plan B switch", () => {
    render(<RulesCard switchRule={null} redirectRule={null} />);
    expect(screen.getByText(/One plan for now/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Plan B switch amount")).not.toBeInTheDocument();
  });
});
