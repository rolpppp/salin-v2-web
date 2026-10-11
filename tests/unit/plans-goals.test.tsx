import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoalView, GoalsData } from "@/lib/data/goals";

const actions = vi.hoisted(() => ({
  addGoalAction: vi.fn(),
  archiveGoalAction: vi.fn(),
  restoreGoalAction: vi.fn(),
  updateGoalAction: vi.fn(),
}));
vi.mock("@/lib/actions/goals", () => actions);

import { GoalsPanel } from "@/components/plans/goals/GoalsPanel";

const emergency: GoalView = {
  id: "g1",
  name: "Emergency fund",
  targetMinor: 5_000_000,
  currency: "PHP",
  savedMinor: 1_290_528,
  progressBp: 2_581,
  linkedBucketId: "b-em",
  linkedShareBp: 10_000,
  isPlanSwitch: true,
  feed: "Fed from all of Emergency fund",
};
const pc: GoalView = { ...emergency, id: "g2", name: "PC Build", targetMinor: 8_000_000, savedMinor: 201_645, progressBp: 252, linkedBucketId: "b-sink", linkedShareBp: 5_000, isPlanSwitch: false, feed: "Fed from 50% of Sinking" };
const buckets = [
  { id: "b-em", name: "Emergency fund" },
  { id: "b-sink", name: "Sinking" },
];
const data = (over: Partial<GoalsData> = {}): GoalsData => ({ goals: [emergency, pc], archived: [], buckets, ...over });

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
});

describe("GoalsPanel", () => {
  it("shows where it's fed from, a bar, '₱X saved of ₱Y' and an editable target", () => {
    render(<GoalsPanel data={data()} />);
    expect(screen.getByText("Fed from 50% of Sinking")).toBeInTheDocument();
    const saved = screen.getAllByTestId("goal-saved");
    expect(saved[0]).toHaveTextContent("₱12,905.28 saved");
    expect(saved[0]).toHaveTextContent("of ₱50,000.00");
    expect(screen.getByRole("progressbar", { name: "Emergency fund progress" })).toHaveAttribute("aria-valuetext", "26% of target");
    expect(screen.getByLabelText("Emergency fund target")).toHaveValue("50,000");
  });

  it("retargets in integer centavos on blur; the Plan B switch note is announced by the action", async () => {
    actions.updateGoalAction.mockResolvedValueOnce({ ok: true });
    render(<GoalsPanel data={data()} />);
    const input = screen.getByLabelText("PC Build target");
    await userEvent.clear(input);
    await userEvent.type(input, "90,000.50");
    await userEvent.tab();
    expect(actions.updateGoalAction).toHaveBeenCalledWith({ id: "g2", targetMinor: 9_000_050 });
  });

  it("a bad target is explained and nothing is sent", async () => {
    render(<GoalsPanel data={data()} />);
    const input = screen.getByLabelText("PC Build target");
    await userEvent.clear(input);
    await userEvent.type(input, "abc");
    await userEvent.tab();
    expect(await screen.findByText("Enter an amount like 50,000.")).toBeInTheDocument();
    expect(actions.updateGoalAction).not.toHaveBeenCalled();
  });

  it("when a retarget fails the previous value comes back", async () => {
    actions.updateGoalAction.mockResolvedValueOnce({ ok: false, error: "Couldn't save. Check your connection and try again." });
    render(<GoalsPanel data={data()} />);
    const input = screen.getByLabelText("PC Build target");
    await userEvent.clear(input);
    await userEvent.type(input, "1,000");
    await userEvent.tab();
    expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument();
    expect(input).toHaveValue("80,000");
  });

  it("the Plan B switch goal can't be archived here; others can", async () => {
    actions.archiveGoalAction.mockResolvedValueOnce({ ok: true });
    render(<GoalsPanel data={data()} />);
    expect(screen.queryByRole("button", { name: "Archive Emergency fund" })).not.toBeInTheDocument();
    expect(screen.getByText("Plan B switch")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archive PC Build" }));
    expect(actions.archiveGoalAction).toHaveBeenCalledWith({ id: "g2" });
  });

  it("links a goal to a bucket and a share (whole percent -> basis points)", async () => {
    actions.updateGoalAction.mockResolvedValue({ ok: true });
    render(<GoalsPanel data={data()} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Bucket feeding PC Build" }), "b-em");
    expect(actions.updateGoalAction).toHaveBeenCalledWith({ id: "g2", bucketId: "b-em", shareBp: 5_000 });
    const share = screen.getByLabelText("Share of the bucket for PC Build, in percent");
    await userEvent.clear(share);
    await userEvent.type(share, "25");
    await userEvent.tab();
    expect(actions.updateGoalAction).toHaveBeenLastCalledWith({ id: "g2", bucketId: "b-em", shareBp: 2_500 });
  });

  it("empty: one line and 'Add a goal'; adding sends centavos", async () => {
    actions.addGoalAction.mockResolvedValueOnce({ ok: true, value: { id: "n" } });
    render(<GoalsPanel data={data({ goals: [] })} />);
    expect(screen.getByRole("heading", { name: "No goals yet" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("₱");
    await userEvent.click(screen.getByRole("button", { name: "+ Add a goal" }));
    await userEvent.type(screen.getByLabelText("Name"), "Trip");
    await userEvent.type(screen.getByLabelText("Target"), "30,000");
    await userEvent.selectOptions(screen.getByLabelText("Fed from"), "b-sink");
    await userEvent.clear(screen.getByLabelText("Share of that bucket (%)"));
    await userEvent.type(screen.getByLabelText("Share of that bucket (%)"), "25");
    await userEvent.click(screen.getByRole("button", { name: "Add goal" }));
    expect(actions.addGoalAction).toHaveBeenCalledWith({ name: "Trip", targetMinor: 3_000_000, bucketId: "b-sink", shareBp: 2_500 });
  });

  it("add: a missing target is explained before anything is sent", async () => {
    render(<GoalsPanel data={data({ goals: [] })} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add a goal" }));
    await userEvent.type(screen.getByLabelText("Name"), "Trip");
    await userEvent.click(screen.getByRole("button", { name: "Add goal" }));
    expect(await screen.findByText("Enter a target amount.")).toBeInTheDocument();
    expect(actions.addGoalAction).not.toHaveBeenCalled();
  });

  it("lists archived goals with Restore", async () => {
    actions.restoreGoalAction.mockResolvedValueOnce({ ok: true });
    render(<GoalsPanel data={data({ archived: [{ id: "g9", name: "Old trip" }] })} />);
    await userEvent.click(screen.getByRole("button", { name: "Restore Old trip" }));
    expect(actions.restoreGoalAction).toHaveBeenCalledWith({ id: "g9" });
  });
});
