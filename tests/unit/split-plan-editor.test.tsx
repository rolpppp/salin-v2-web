import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { SplitPlanEditor } from "@/components/plans/split/SplitPlanEditor";
import type { SplitActions } from "@/components/plans/split/actions";
import type { PlanBucket, SplitPlanData } from "@/lib/data/plans";

vi.mock("@/lib/actions/plans", () => ({
  saveSplitPlan: vi.fn(),
  setBucketKeptIn: vi.fn(),
  setPlanSwitchTarget: vi.fn(),
  createPlan: vi.fn(),
  renamePlan: vi.fn(),
  deletePlan: vi.fn(),
  setActivePlan: vi.fn(),
  createBucket: vi.fn(),
  updateBucket: vi.fn(),
  bucketArchiveReason: vi.fn(),
  archiveBucket: vi.fn(),
  restoreBucket: vi.fn(),
}));

const b = (over: Partial<PlanBucket> & Pick<PlanBucket, "id" | "name">): PlanBucket => ({
  shortName: over.name,
  hue: null,
  groupKey: "spend",
  note: null,
  planless: false,
  keptInAccountId: "acc-1",
  isBuiltin: true,
  ...over,
});

const data: SplitPlanData = {
  buckets: [
    b({ id: "b-living", name: "Living", hue: "living" }),
    b({ id: "b-em", name: "Emergency fund", hue: "emergency", groupKey: "save" }),
    b({ id: "b-fun", name: "Fun", hue: "fun", keptInAccountId: "acc-2" }),
    b({ id: "b-dost", name: "Scholarship", hue: "dost", groupKey: "set_aside", planless: true }),
  ],
  archived: [b({ id: "b-old", name: "Old fund", hue: "c2", isBuiltin: false, groupKey: "save" })],
  accounts: [
    { id: "acc-1", name: "MariBank", isArchived: false },
    { id: "acc-2", name: "GCash", isArchived: false },
  ],
  plans: [
    { key: "A", name: "Plan A", lines: { "b-living": 5000, "b-em": 3000, "b-fun": 2000 } },
    { key: "B", name: "Plan B", lines: { "b-living": 6000, "b-em": 2000, "b-fun": 2000 } },
  ],
  settings: { mode: "auto", activeKey: "A", autoFrom: "A", autoTo: "B", targetMinor: 5_000_000, nowMinor: 1_234_500, emergencyBucketId: "b-em", emergencyName: "Emergency fund" },
  redirectRule: { fromBucketName: "Rent", toBucketName: "Emergency fund", untilDate: "2027-01-01" },
};

function actions(over: Partial<SplitActions> = {}): SplitActions {
  return {
    savePlan: vi.fn().mockResolvedValue({ ok: true }),
    setKeptIn: vi.fn().mockResolvedValue({ ok: true }),
    setTarget: vi.fn().mockResolvedValue({ ok: true }),
    createPlan: vi.fn().mockResolvedValue({ ok: true, key: "p_new00001" }),
    renamePlan: vi.fn().mockResolvedValue({ ok: true }),
    deletePlan: vi.fn().mockResolvedValue({ ok: true }),
    setActivePlan: vi.fn().mockResolvedValue({ ok: true }),
    createBucket: vi.fn().mockResolvedValue({ ok: true, id: "b-new" }),
    updateBucket: vi.fn().mockResolvedValue({ ok: true }),
    archiveReason: vi.fn().mockResolvedValue({ ok: true, reason: null }),
    archiveBucket: vi.fn().mockResolvedValue({ ok: true }),
    restoreBucket: vi.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
}

function setup(a: SplitActions = actions(), d: SplitPlanData = data) {
  render(
    <LiveRegionProvider>
      <SplitPlanEditor data={d} actions={a} />
    </LiveRegionProvider>,
  );
  return a;
}

async function setPct(label: string, value: string) {
  const el = screen.getByLabelText(label);
  await userEvent.clear(el);
  await userEvent.type(el, value);
}

describe("plan bar and editor", () => {
  it("shows a chip per plan, marks the one splitting paydays, and one plan's rows at a time", () => {
    setup();
    const bar = screen.getByTestId("plan-bar");
    expect(within(bar).getByRole("button", { name: /Plan A/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(bar).getByRole("button", { name: /Plan B/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(bar).getByTestId("active-plan")).toHaveTextContent("Splitting your paydays");
    expect(screen.getByLabelText("Living percent")).toHaveValue("50");
    expect(screen.queryByLabelText("Scholarship percent")).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-total")).toHaveTextContent("100%");
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
  });

  it("switching chips shows that plan's numbers", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Plan B/ }));
    expect(screen.getByLabelText("Living percent")).toHaveValue("60");
  });

  it("coral total with the fix-it sentence when not 100; Save stays off and says the last saved version is used", async () => {
    const a = setup();
    await setPct("Living percent", "45");
    expect(screen.getByTestId("plan-total")).toHaveTextContent("Adds up to 95%. Give 5% to a bucket.");
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
    expect(screen.getByTestId("save-note")).toHaveTextContent("last saved version is still used");
    expect(a.savePlan).not.toHaveBeenCalled();
  });

  it("stepper buttons move one point", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Decrease Living by 1%" }));
    expect(screen.getByLabelText("Living percent")).toHaveValue("49");
    await userEvent.click(screen.getByRole("button", { name: "Increase Fun by 1%" }));
    expect(screen.getByLabelText("Fun percent")).toHaveValue("21");
    expect(screen.getByTestId("plan-total")).toHaveTextContent("100%");
  });

  it("saves at 100 in basis points for that plan only, and announces it", async () => {
    const a = setup();
    await setPct("Living percent", "45");
    await setPct("Emergency fund percent", "35");
    await userEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(a.savePlan).toHaveBeenCalledWith("A", [
      { bucketId: "b-living", percentBp: 4500 },
      { bucketId: "b-em", percentBp: 3500 },
      { bucketId: "b-fun", percentBp: 2000 },
    ]);
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Plan A saved. It applies to paydays from now on; past paydays stay as they were."));
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
  });

  it("a refused save keeps the draft, says the last saved plan is still used, and moves focus to the message", async () => {
    const a = setup(actions({ savePlan: vi.fn().mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." }) }));
    await setPct("Living percent", "40");
    await setPct("Fun percent", "30");
    await userEvent.click(screen.getByRole("button", { name: "Save plan" }));
    const err = await screen.findByTestId("save-error");
    expect(err).toHaveTextContent("Couldn't save. Check your connection and try again. Your last saved Plan A is still used.");
    await waitFor(() => expect(err).toHaveFocus());
    expect(screen.getByLabelText("Living percent")).toHaveValue("40");
    expect(a.savePlan).toHaveBeenCalledTimes(1);
  });

  it("a non-number marks the field invalid and blocks Save", async () => {
    setup();
    await setPct("Fun percent", "12.5");
    expect(screen.getByLabelText("Fun percent")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("plan-total")).toHaveTextContent("Fun needs a whole number from 0 to 100.");
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
  });

  it("keeps focus in the field while typing (no remount)", async () => {
    setup();
    const living = screen.getByLabelText("Living percent");
    await userEvent.click(living);
    await userEvent.keyboard("{End}1");
    expect(living).toHaveFocus();
  });

  it("compare shows the other plan read-only", async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText("Compare with"), "B");
    expect(screen.getByRole("columnheader", { name: "Plan B" })).toBeInTheDocument();
    expect(screen.getAllByText("60%").length).toBeGreaterThan(0);
  });

  it("shows pesos per typical pay only when a pay amount is given", () => {
    render(
      <LiveRegionProvider>
        <SplitPlanEditor data={data} actions={actions()} typicalPayMinor={2_000_000} />
      </LiveRegionProvider>,
    );
    expect(screen.getByRole("columnheader", { name: /Per ₱20,000\.00 pay/ })).toBeInTheDocument();
    expect(screen.getByText("₱10,000.00")).toBeInTheDocument();
  });
});

describe("new plans", () => {
  it("from scratch: every bucket 0%, Save off until 100, then creates the plan and focuses its name", async () => {
    const a = setup();
    await userEvent.click(screen.getByRole("button", { name: "+ New plan" }));
    await userEvent.click(screen.getByRole("button", { name: "From scratch" }));
    expect(screen.getByLabelText("Living percent")).toHaveValue("0");
    expect(screen.getByTestId("plan-total")).toHaveTextContent("0%");
    const name = screen.getByLabelText("Plan name");
    expect(name).toHaveFocus();
    await userEvent.type(name, "Saving for Japan");
    const create = screen.getByRole("button", { name: "Create plan" });
    expect(create).toBeDisabled();
    await setPct("Living percent", "40");
    await setPct("Emergency fund percent", "40");
    expect(create).toBeDisabled();
    await setPct("Fun percent", "20");
    expect(create).toBeEnabled();
    await userEvent.click(create);
    expect(a.createPlan).toHaveBeenCalledWith({
      name: "Saving for Japan",
      lines: [
        { bucketId: "b-living", percentBp: 4000 },
        { bucketId: "b-em", percentBp: 4000 },
        { bucketId: "b-fun", percentBp: 2000 },
      ],
    });
    const chip = await screen.findByRole("button", { name: /Saving for Japan/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByLabelText("Plan name")).toHaveValue("Saving for Japan"));
    expect(screen.getByLabelText("Plan name")).toHaveFocus();
    expect(screen.getByLabelText("Living percent")).toHaveValue("40");
  });

  it("refuses a duplicate name before asking the server", async () => {
    const a = setup();
    await userEvent.click(screen.getByRole("button", { name: "+ New plan" }));
    await userEvent.click(screen.getByRole("button", { name: "From scratch" }));
    await userEvent.type(screen.getByLabelText("Plan name"), "plan a");
    await setPct("Living percent", "100");
    await userEvent.click(screen.getByRole("button", { name: "Create plan" }));
    expect(await screen.findByText("You already have one with that name.")).toBeInTheDocument();
    expect(a.createPlan).not.toHaveBeenCalled();
  });

  it("copy: creates 'Copy of Plan A' from that plan, opens it, and focuses the name for renaming", async () => {
    const a = setup();
    await userEvent.click(screen.getByRole("button", { name: "+ New plan" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy of Plan B" }));
    expect(a.createPlan).toHaveBeenCalledWith({ name: "Copy of Plan B", copyFrom: "B" });
    const name = await screen.findByLabelText("Plan name");
    await waitFor(() => expect(name).toHaveValue("Copy of Plan B"));
    expect(name).toHaveFocus();
    expect(screen.getByLabelText("Living percent")).toHaveValue("60");
  });

  it("Escape closes the New plan menu", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "+ New plan" }));
    expect(screen.getByRole("button", { name: "From scratch" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "From scratch" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New plan" })).toHaveFocus();
  });

  it("renames inline", async () => {
    const a = setup();
    const name = screen.getByLabelText("Plan name");
    await userEvent.clear(name);
    await userEvent.type(name, "Everyday");
    await userEvent.tab();
    expect(a.renamePlan).toHaveBeenCalledWith("A", "Everyday");
    expect(await screen.findByRole("button", { name: /Everyday/ })).toBeInTheDocument();
  });

  it("delete asks first, and shows the server's refusal verbatim at the control", async () => {
    const reason = "Plan A is the plan splitting your paydays. Choose another plan under Which plan splits your paydays first.";
    const a = setup(actions({ deletePlan: vi.fn().mockResolvedValue({ ok: false, error: reason }) }));
    await userEvent.click(screen.getByRole("button", { name: "Delete plan" }));
    expect(a.deletePlan).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete Plan A" }));
    const err = await screen.findByTestId("delete-error");
    expect(err).toHaveTextContent(reason);
    await waitFor(() => expect(err).toHaveFocus());
    expect(screen.getByRole("button", { name: /Plan A/ })).toBeInTheDocument();
  });

  it("a confirmed delete removes the chip and opens the active plan", async () => {
    const a = setup();
    await userEvent.click(screen.getByRole("button", { name: /Plan B/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete plan" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Plan B" }));
    expect(a.deletePlan).toHaveBeenCalledWith("B");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Plan B/ })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Plan A/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Which plan splits your paydays", () => {
  it("shows Automatic with the target and 'Now', and Always use", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Automatic" })).toBeChecked();
    expect(screen.getByLabelText("Switch amount in pesos")).toHaveValue("50,000");
    expect(screen.getByTestId("switch-now")).toHaveTextContent("₱12,345.00");
    expect(screen.getByRole("radio", { name: /Always use/ })).not.toBeChecked();
    expect(screen.getByText("Applies to paydays after the change.")).toBeInTheDocument();
    expect(screen.getByTestId("redirect-rule")).toHaveTextContent("Rent’s share goes to Emergency fund until January 1, 2027.");
  });

  it("choosing a plan manually saves with set_active_plan and moves the marker", async () => {
    const a = setup();
    await userEvent.click(screen.getByRole("radio", { name: /Always use/ }));
    await userEvent.selectOptions(screen.getByLabelText("Always use plan"), "B");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(a.setActivePlan).toHaveBeenCalledWith({ mode: "manual", planKey: "B" });
    await waitFor(() => expect(within(screen.getByRole("button", { name: /Plan B/ })).getByTestId("active-plan")).toBeInTheDocument());
  });

  it("automatic from/to can be changed and are refused when equal", async () => {
    const a = setup();
    await userEvent.selectOptions(screen.getByLabelText("Automatic: then switch to plan"), "A");
    // The option for the other end of the pair is disabled, so equal plans can't be picked.
    expect(within(screen.getByLabelText("Automatic: then switch to plan")).getByRole("option", { name: "Plan A" })).toBeDisabled();
    expect(a.setActivePlan).not.toHaveBeenCalled();
  });

  it("a refusal from the server shows at the card", async () => {
    setup(actions({ setActivePlan: vi.fn().mockResolvedValue({ ok: false, error: "That plan was deleted." }) }));
    await userEvent.click(screen.getByRole("radio", { name: /Always use/ }));
    await userEvent.selectOptions(screen.getByLabelText("Always use plan"), "B");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByTestId("active-plan-error")).toHaveTextContent("That plan was deleted.");
  });

  it("saves a new switch amount in centavos on blur, and refuses bad amounts", async () => {
    const a = setup();
    const input = screen.getByLabelText("Switch amount in pesos");
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.tab();
    expect(screen.getByText("Enter an amount above ₱0 and up to ₱10,000,000.")).toBeInTheDocument();
    expect(a.setTarget).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, "75,000.50");
    await userEvent.tab();
    expect(a.setTarget).toHaveBeenCalledWith(7_500_050);
  });

  it("Automatic is unavailable with one plan", () => {
    setup(actions(), { ...data, plans: [data.plans[0]] });
    expect(screen.getByRole("radio", { name: "Automatic" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Always use/ })).toBeChecked();
    expect(screen.getByText(/Automatic needs two plans/)).toBeInTheDocument();
  });
});

describe("Buckets", () => {
  it("Kept in still saves at once; a failure puts the old account back at the control", async () => {
    const failing = actions({ setKeptIn: vi.fn().mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." }) });
    setup(failing);
    expect(screen.getByLabelText("Scholarship is kept in")).toHaveValue("acc-1");
    await userEvent.selectOptions(screen.getByLabelText("Living is kept in"), "acc-2");
    expect(failing.setKeptIn).toHaveBeenCalledWith("b-living", "acc-2");
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Living is kept in")).toHaveValue("acc-1");
  });

  it("adds a custom bucket with name, group, colour (radios with names) and account", async () => {
    const a = setup();
    await userEvent.click(screen.getByRole("button", { name: "Add a bucket" }));
    const form = screen.getByRole("form", { name: "Add a bucket" });
    await userEvent.type(within(form).getByLabelText("Name"), "Japan trip");
    await userEvent.click(within(form).getByRole("radio", { name: "Save" }));
    await userEvent.click(within(form).getByRole("radio", { name: "Blue" }));
    await userEvent.selectOptions(within(form).getByLabelText("Kept in"), "acc-2");
    await userEvent.click(within(form).getByRole("button", { name: "Add bucket" }));
    expect(a.createBucket).toHaveBeenCalledWith({ name: "Japan trip", group: "save", hue: "c5", keptIn: "acc-2" });
    expect(await screen.findByLabelText("Japan trip is kept in")).toHaveValue("acc-2");
    // it starts at 0% in every plan: it joins the editor rows at 0
    expect(screen.getByLabelText("Japan trip percent")).toHaveValue("0");
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
  });

  it("a duplicate bucket name is refused with the server's sentence", async () => {
    setup(actions({ createBucket: vi.fn().mockResolvedValue({ ok: false, error: "You already have a bucket named Japan trip." }) }));
    await userEvent.click(screen.getByRole("button", { name: "Add a bucket" }));
    await userEvent.type(screen.getByLabelText("Name"), "Japan trip");
    await userEvent.click(screen.getByRole("button", { name: "Add bucket" }));
    const err = await screen.findByTestId("add-bucket-error");
    expect(err).toHaveTextContent("You already have a bucket named Japan trip.");
    await waitFor(() => expect(err).toHaveFocus());
  });

  it("archive: asks for the reason first and shows it inline when there is one", async () => {
    const reason = "Fun still has ₱120.00 in it. Move it with a cover first.";
    const a = setup(actions({ archiveReason: vi.fn().mockResolvedValue({ ok: true, reason }) }));
    await userEvent.click(screen.getByRole("button", { name: "Archive Fun" }));
    const msg = await screen.findByTestId("archive-reason");
    expect(msg).toHaveTextContent(reason);
    await waitFor(() => expect(msg).toHaveFocus());
    expect(a.archiveReason).toHaveBeenCalledWith("b-fun");
    expect(a.archiveBucket).not.toHaveBeenCalled();
  });

  it("archive with no reason archives, moves the bucket to Archived, and Restore brings it back at 0%", async () => {
    const a = setup();
    await userEvent.click(screen.getByRole("button", { name: "Archive Fun" }));
    await waitFor(() => expect(a.archiveBucket).toHaveBeenCalledWith("b-fun"));
    await waitFor(() => expect(screen.queryByLabelText("Fun percent")).not.toBeInTheDocument());
    expect(screen.getByText("Archived (2)")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Archived (2)"));
    await userEvent.click(screen.getByRole("button", { name: "Restore Fun" }));
    expect(a.restoreBucket).toHaveBeenCalledWith("b-fun");
    expect(await screen.findByLabelText("Fun percent")).toBeInTheDocument();
  });

  it("built-in colours can't be changed; custom ones can", async () => {
    const a = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit Living" }));
    const form = screen.getByRole("form", { name: "Edit Living" });
    expect(within(form).getByRole("radio", { name: "Blue" })).toBeDisabled();
    expect(within(form).getByText("Built-in buckets keep their colour.")).toBeInTheDocument();
    await userEvent.clear(within(form).getByLabelText("Name"));
    await userEvent.type(within(form).getByLabelText("Name"), "Everyday");
    await userEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    expect(a.updateBucket).toHaveBeenCalledWith({ id: "b-living", name: "Everyday", shortName: "Living", group: "spend", hue: "living" });
    expect(await screen.findByLabelText("Everyday percent")).toBeInTheDocument();
  });

  it("every swatch is a named radio inside one group", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Add a bucket" }));
    const group = screen.getByRole("group", { name: "Colour" });
    expect(within(group).getAllByRole("radio")).toHaveLength(8);
  });
});

describe("a user with no split plan yet (just tracking)", () => {
  const none: SplitPlanData = { ...data, plans: [], redirectRule: null };

  it("still shows the buckets and offers to start a plan instead of a dead end", async () => {
    const a = setup(actions(), none);
    expect(screen.getByTestId("no-plan")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Your buckets|Buckets/i })).toBeInTheDocument();
    expect(screen.queryByText("Rules")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start a plan" }));
    expect(screen.queryByTestId("no-plan")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Living percent")).toBeInTheDocument();
    expect(a.createPlan).not.toHaveBeenCalled();
  });
});
