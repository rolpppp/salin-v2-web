import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IncomeSources, type IncomeActions } from "@/components/plans/income/IncomeSources";
import type { IncomeSourcesData, SourceView } from "@/lib/data/income-sources";

vi.mock("@/lib/actions/income-sources", () => ({
  addIncomeSource: vi.fn(),
  removeIncomeSource: vi.fn(),
  renameIncomeSource: vi.fn(),
  saveIncomeSourceSplit: vi.fn(),
  setIncomeSourceArchived: vi.fn(),
  setIncomeSourceLandsIn: vi.fn(),
  setIncomeSourceRule: vi.fn(),
}));

const buckets = [
  { id: "b-tax", name: "Tax", shortName: "Tax", hue: "tax" },
  { id: "b-living", name: "Living", shortName: "Living", hue: "living" },
  { id: "b-sink", name: "Sinking", shortName: "Sinking", hue: "sinking" },
  { id: "b-fun", name: "Fun", shortName: "Fun", hue: "fun" },
  { id: "b-dost", name: "Scholarship", shortName: "Scholarship", hue: "dost" },
];

const src = (over: Partial<SourceView> & Pick<SourceView, "id" | "name">): SourceView => ({
  kind: "other",
  rule: "ask",
  wholeBucketId: null,
  landsInAccountId: "acc-1",
  isArchived: false,
  hasIncome: false,
  split: {},
  ...over,
});

function data(sources: SourceView[]): IncomeSourcesData {
  return {
    sources,
    buckets,
    accounts: [
      { id: "acc-1", name: "MariBank" },
      { id: "acc-2", name: "GCash" },
    ],
    activePlan: "Plan A",
  };
}

function actions(over: Partial<IncomeActions> = {}): IncomeActions {
  const ok = () => vi.fn().mockResolvedValue({ ok: true });
  return {
    add: vi.fn().mockResolvedValue({ ok: true, id: "new-1", name: "Salary" }),
    rename: ok(),
    setRule: ok(),
    saveSplit: ok(),
    setLandsIn: ok(),
    setArchived: ok(),
    remove: ok(),
    ...over,
  };
}

const side = src({ id: "s-side", name: "Freelance", kind: "side_hustle", rule: "own", split: { "b-tax": 1000, "b-sink": 4000, "b-fun": 5000 } });
const work = src({ id: "s-work", name: "Work", kind: "salary", rule: "plan", hasIncome: true });

describe("IncomeSources", () => {
  it("lists each source with its rule and a one-line description", () => {
    render(<IncomeSources data={data([work, side])} actions={actions()} />);
    expect(screen.getByLabelText("Rule for Work")).toHaveValue("plan");
    expect(screen.getByText("Uses Plan A percentages.")).toBeInTheDocument();
    expect(screen.getByLabelText("Rule for Freelance")).toHaveValue("own");
    expect(screen.getByLabelText("Work lands in")).toHaveValue("acc-1");
  });

  it("offers the four rules", () => {
    render(<IncomeSources data={data([work])} actions={actions()} />);
    const options = within(screen.getByLabelText("Rule for Work")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Split by my plan", "Its own split", "Keep it whole", "Ask me each time"]);
  });

  it("shows the own split editor with a live total: 100% is teal, anything else says what is missing", async () => {
    const a = actions();
    render(<IncomeSources data={data([side])} actions={a} />);
    expect(screen.getByTestId("own-total-s-side")).toHaveTextContent("100%");
    expect(screen.getByLabelText("Tax percent for Freelance")).toHaveValue("10");
    const fun = screen.getByLabelText("Fun percent for Freelance");
    await userEvent.clear(fun);
    await userEvent.type(fun, "40");
    expect(screen.getByTestId("own-total-s-side")).toHaveTextContent("90% · needs 100%");
    expect(screen.getByText(/needs a job until it adds up to 100%/)).toBeInTheDocument();
    await userEvent.tab();
    // an incomplete split is stored as it is, never rescaled
    expect(a.saveSplit).toHaveBeenCalledWith("s-side", [
      { bucketId: "b-tax", percentBp: 1000 },
      { bucketId: "b-sink", percentBp: 4000 },
      { bucketId: "b-fun", percentBp: 4000 },
    ]);
  });

  it("does not send a split over 100% or with a bad number", async () => {
    const a = actions();
    render(<IncomeSources data={data([side])} actions={a} />);
    const fun = screen.getByLabelText("Fun percent for Freelance");
    await userEvent.clear(fun);
    await userEvent.type(fun, "60");
    await userEvent.tab();
    expect(a.saveSplit).not.toHaveBeenCalled();
    expect(screen.getByText(/The split adds up to 110%\. Take 10% out\. Not saved yet/)).toBeInTheDocument();
    await userEvent.clear(fun);
    await userEvent.type(fun, "5.5");
    await userEvent.tab();
    expect(a.saveSplit).not.toHaveBeenCalled();
    expect(fun).toHaveAttribute("aria-invalid", "true");
  });

  it("treats 0 as skipped: the field dims and no line is sent for it", async () => {
    const a = actions();
    render(<IncomeSources data={data([side])} actions={a} />);
    const tax = screen.getByLabelText("Tax percent for Freelance");
    await userEvent.clear(tax);
    await userEvent.type(tax, "0");
    const fun = screen.getByLabelText("Fun percent for Freelance");
    await userEvent.clear(fun);
    await userEvent.type(fun, "60");
    await userEvent.tab();
    const lines = vi.mocked(a.saveSplit).mock.calls.at(-1)?.[1] ?? [];
    expect(lines.find((l) => l.bucketId === "b-tax")).toBeUndefined();
    expect(lines.reduce((s, l) => s + l.percentBp, 0)).toBe(10000);
    expect(tax.closest("label")?.className).toMatch(/off/);
  });

  it("an own split can be built from empty after switching a source to its own split", async () => {
    const a = actions();
    render(<IncomeSources data={data([src({ id: "s-g", name: "Gifts" })])} actions={a} />);
    expect(screen.queryByLabelText("Tax percent for Gifts")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Rule for Gifts"), "own");
    expect(a.setRule).toHaveBeenCalledWith("s-g", "own", undefined);
    expect(screen.getByTestId("own-total-s-g")).toHaveTextContent("0% · needs 100%");
  });

  it("Keep it whole asks for a bucket and defaults sensibly", async () => {
    const a = actions();
    render(<IncomeSources data={data([src({ id: "s-st", name: "Stipend", kind: "scholarship" })])} actions={a} />);
    await userEvent.selectOptions(screen.getByLabelText("Rule for Stipend"), "whole");
    expect(a.setRule).toHaveBeenCalledWith("s-st", "whole", "b-dost");
    expect(screen.getByLabelText("Bucket for Stipend")).toHaveValue("b-dost");
    await userEvent.selectOptions(screen.getByLabelText("Bucket for Stipend"), "b-living");
    expect(a.setRule).toHaveBeenLastCalledWith("s-st", "whole", "b-living");
    expect(screen.getByText("All of it stays in Living. Nothing is split.")).toBeInTheDocument();
  });

  it("never offers Rent for a whole bucket (the data layer drops it)", () => {
    render(<IncomeSources data={data([src({ id: "s-a", name: "Allowance", kind: "allowance", rule: "whole", wholeBucketId: "b-living" })])} actions={actions()} />);
    const names = within(screen.getByLabelText("Bucket for Allowance")).getAllByRole("option").map((o) => o.textContent);
    expect(names).not.toContain("Rent");
  });

  it("a failed rule change puts the old rule back and says why", async () => {
    const a = actions({ setRule: vi.fn().mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." }) });
    render(<IncomeSources data={data([work])} actions={a} />);
    await userEvent.selectOptions(screen.getByLabelText("Rule for Work"), "ask");
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Rule for Work")).toHaveValue("plan");
  });

  it("lands in saves on change", async () => {
    const a = actions();
    render(<IncomeSources data={data([work])} actions={a} />);
    await userEvent.selectOptions(screen.getByLabelText("Work lands in"), "acc-2");
    expect(a.setLandsIn).toHaveBeenCalledWith("s-work", "acc-2");
  });

  it("a source with income shows its name as text and can only be archived; a new one can be renamed and removed", async () => {
    const a = actions();
    render(<IncomeSources data={data([work, src({ id: "s-new", name: "Side hustle", kind: "side_hustle" })])} actions={a} />);
    expect(screen.queryByLabelText("Name of Work")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive Work" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Work" })).not.toBeInTheDocument();

    const name = screen.getByLabelText("Name of Side hustle");
    await userEvent.clear(name);
    await userEvent.type(name, "Logo commissions");
    await userEvent.tab();
    expect(a.rename).toHaveBeenCalledWith("s-new", "Logo commissions");

    await userEvent.click(screen.getByRole("button", { name: "Remove Logo commissions" }));
    expect(a.remove).toHaveBeenCalledWith("s-new");
  });

  it("refuses an empty name without calling the server and restores it", async () => {
    const a = actions();
    render(<IncomeSources data={data([src({ id: "s-new", name: "Gift", kind: "gift" })])} actions={a} />);
    const name = screen.getByLabelText("Name of Gift");
    await userEvent.clear(name);
    await userEvent.tab();
    expect(a.rename).not.toHaveBeenCalled();
    expect(screen.getByText("Give the source a name.")).toBeInTheDocument();
  });

  it("+ Add income source opens the seven presets and adds the one picked", async () => {
    const a = actions();
    render(<IncomeSources data={data([work])} actions={a} />);
    expect(screen.queryByRole("button", { name: "Side hustle" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Add income source" }));
    const group = screen.getByRole("group", { name: "Income kinds" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Salary", "Scholarship", "Side hustle", "Allowance", "Gift", "Refund", "Other"]);
    await userEvent.click(within(group).getByRole("button", { name: "Side hustle" }));
    expect(a.add).toHaveBeenCalledWith("side_hustle");
    await waitFor(() => expect(screen.queryByRole("group", { name: "Income kinds" })).not.toBeInTheDocument());
  });

  it("focuses the new source's name field once it arrives", async () => {
    const a = actions();
    const { rerender } = render(<IncomeSources data={data([work])} actions={a} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add income source" }));
    await userEvent.click(screen.getByRole("button", { name: "Salary" }));
    rerender(<IncomeSources data={data([work, src({ id: "new-1", name: "Salary", kind: "salary", rule: "plan" })])} actions={a} />);
    await waitFor(() => expect(screen.getByLabelText("Name of Salary")).toHaveFocus());
  });

  it("an add that fails says so and keeps the presets", async () => {
    const a = actions({ add: vi.fn().mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." }) });
    render(<IncomeSources data={data([work])} actions={a} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add income source" }));
    await userEvent.click(screen.getByRole("button", { name: "Gift" }));
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Income kinds" })).toBeInTheDocument();
  });

  it("with no sources it explains how to add the first one, with presets showing", () => {
    render(<IncomeSources data={data([])} actions={actions()} />);
    expect(screen.getByText(/No income sources yet/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Income kinds" })).toBeInTheDocument();
  });

  it("archived sources are listed apart and can be restored", async () => {
    const a = actions();
    render(<IncomeSources data={data([work, src({ id: "s-old", name: "Old gig", isArchived: true, hasIncome: true })])} actions={a} />);
    expect(screen.queryByLabelText("Rule for Old gig")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restore Old gig" }));
    expect(a.setArchived).toHaveBeenCalledWith("s-old", false);
  });

  it("says a rule change only reaches money that has no job yet", () => {
    render(<IncomeSources data={data([work])} actions={actions()} />);
    expect(screen.getByText(/applies to money that hasn’t been given a job yet/)).toBeInTheDocument();
  });
});
