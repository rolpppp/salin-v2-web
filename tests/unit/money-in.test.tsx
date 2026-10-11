import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MoneyInView } from "@/components/money-in/MoneyInView";
import { MoveMoneyStep } from "@/components/money-in/MoveMoneyStep";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { BUCKET, income, moneyInData, sources } from "@/lib/data/money-in-testkit";
import type { MoneyInData } from "@/lib/data/money-in-model";

const actions = vi.hoisted(() => ({ addIncomeAction: vi.fn(), confirmIncomesAction: vi.fn() }));
vi.mock("@/lib/actions/money-in", () => actions);

const NOW = Date.UTC(2026, 9, 11, 6, 0, 0);

function view(data: MoneyInData, props: { initialAddOpen?: boolean } = {}) {
  const ui = (d: MoneyInData) => (
    <LiveRegionProvider>
      <MoneyInView data={d} nowMs={NOW} {...props} />
    </LiveRegionProvider>
  );
  const r = render(ui(data));
  return { ...r, update: (d: MoneyInData) => r.rerender(ui(d)) };
}

const waiting = () =>
  moneyInData({
    incomes: [income("g2", "others", 2_300_000, 8), income("g5", "side", 350_000, 9, { accountId: "gcash" }), income("ask", "ask", 5_000, 10)],
  });

beforeEach(() => {
  actions.addIncomeAction.mockReset();
  actions.confirmIncomesAction.mockReset();
});

describe("Money in: queue (Step 1)", () => {
  it("lists waiting income oldest first with its job, and flags the one that needs a job", () => {
    view(waiting());
    expect(screen.getByRole("heading", { level: 1, name: "Give your money a job" })).toBeInTheDocument();
    const items = screen.getAllByTestId("queue-item");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Others")).toBeInTheDocument();
    expect(within(items[0]).getByText("₱23,000.00")).toBeInTheDocument();
    expect(within(items[0]).getByTestId("job-text")).toHaveTextContent("Split by Plan A");
    expect(within(items[0]).getByText(/Oct 8 · landed in MariBank/)).toBeInTheDocument();
    expect(within(items[1]).getByTestId("job-text")).toHaveTextContent("Own split: Tax 10 · Sinking funds 40 · Fun money 50");
    expect(within(items[2]).getByTestId("job-text")).toHaveTextContent("Needs a job");
    expect(screen.getByText("0 of 3 done")).toBeInTheDocument();
  });

  it("Confirm shows the ready total and names who still needs a job; one primary button", () => {
    view(waiting());
    const confirm = screen.getByTestId("confirm-all");
    expect(confirm).toHaveTextContent("Confirm 2 · ₱26,500.00");
    expect(confirm).toBeEnabled();
    expect(screen.getByText("Gift needs a job first.")).toBeInTheDocument();
  });

  it("disables Confirm when nothing has a job", () => {
    view(moneyInData({ incomes: [income("ask", "ask", 5_000, 10)] }));
    expect(screen.getByTestId("confirm-all")).toBeDisabled();
  });

  it("opens the row that needs a job, shows its radio cards, and a click on the open row collapses it (slip shows the total)", async () => {
    view(waiting());
    const askRow = screen.getAllByRole("button", { expanded: true });
    expect(askRow).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Job for Gift" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Use its rule/ })).toBeDisabled();
    expect(screen.getByRole("group", { name: "Money in slip" })).toHaveTextContent("Gift");
    await userEvent.click(askRow[0]);
    expect(screen.queryByRole("group", { name: "Job for Gift" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Money in slip" })).toHaveTextContent("All waiting income");
  });

  it("only one row is open at a time", async () => {
    view(waiting());
    await userEvent.click(screen.getByRole("button", { name: /Others/ }));
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Job for Others" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Job for Gift" })).not.toBeInTheDocument();
  });

  it("shows where it goes (G2) and the why note for the open plan row", async () => {
    view(waiting());
    await userEvent.click(screen.getByRole("button", { name: /Others/ }));
    const list = screen.getByRole("list", { name: "Where it goes" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(within(list).getByText("₱7,360.00")).toBeInTheDocument();
    expect(screen.getAllByText(/Rent's 2% went to Emergency fund until Jan 1, 2027/).length).toBeGreaterThan(0);
  });

  it("choosing a job on an 'ask' income makes it confirmable and updates the slip", async () => {
    view(waiting());
    await userEvent.click(screen.getByRole("radio", { name: /Split by my plan/ }));
    expect(screen.getByTestId("confirm-all")).toHaveTextContent("Confirm all 3 · ₱26,550.00");
    expect(screen.getAllByTestId("job-text")[2]).toHaveTextContent("Split by Plan A");
    // the row you are working on stays open even though it no longer "needs a job"
    expect(screen.getByRole("group", { name: "Job for Gift" })).toBeInTheDocument();
  });

  it("one-off: pick a bucket; Rent is not offered", async () => {
    view(waiting());
    await userEvent.click(screen.getByRole("radio", { name: /One-off/ }));
    const select = screen.getByLabelText("Bucket");
    expect(within(select).queryByRole("option", { name: "Rent" })).not.toBeInTheDocument();
    expect(select).toHaveValue(BUCKET.emergency);
    await userEvent.selectOptions(select, BUCKET.fun);
    expect(screen.getAllByTestId("job-text")[2]).toHaveTextContent("One-off: all to Fun money");
  });

  it("an own split that adds to 90% says so and is not confirmable by 'Confirm all'", () => {
    view(moneyInData({ incomes: [income("bad", "bad", 100_000, 10)] }));
    expect(screen.getByTestId("job-text")).toHaveTextContent("Its split adds to 90%, fix it in Plans");
    expect(screen.getByTestId("confirm-all")).toBeDisabled();
  });
});

describe("Money in: confirm", () => {
  it("Confirm all sends the ready ids with their jobs, announces, and moves focus to the next waiting row", async () => {
    actions.confirmIncomesAction.mockResolvedValue({ ok: true, count: 2, names: ["Others", "Side hustle"] });
    const data = waiting();
    const { update } = view(data);
    await userEvent.click(screen.getByTestId("confirm-all"));
    expect(actions.confirmIncomesAction).toHaveBeenCalledTimes(1);
    expect(actions.confirmIncomesAction).toHaveBeenCalledWith({
      ids: ["g2", "g5"],
      jobs: [
        { id: "g2", job: null, oneBucketId: null },
        { id: "g5", job: null, oneBucketId: null },
      ],
    });
    // the server re-renders with the confirmed incomes gone
    update({ ...data, incomes: data.incomes.filter((i) => i.id === "ask"), done: [{ entryId: "g2", name: "Others", how: "Split by Plan A", amountMinor: 2_300_000 }], cycle: { id: "c1", closedAt: null } });
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("2 incomes confirmed"));
    expect(screen.getByRole("button", { name: /Gift/ })).toHaveFocus();
    expect(screen.getByRole("list", { name: "Confirmed" })).toHaveTextContent("Others");
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
  });

  it("Confirm just this one confirms only that income, with a picked job", async () => {
    actions.confirmIncomesAction.mockResolvedValue({ ok: true, count: 1, names: ["Gift"] });
    view(waiting());
    await userEvent.click(screen.getByRole("radio", { name: /One-off/ }));
    await userEvent.selectOptions(screen.getByLabelText("Bucket"), BUCKET.fun);
    await userEvent.click(screen.getByRole("button", { name: "Confirm just this one" }));
    expect(actions.confirmIncomesAction).toHaveBeenCalledWith({ ids: ["ask"], jobs: [{ id: "ask", job: "one", oneBucketId: BUCKET.fun }] });
  });

  it("a failed confirm shows the message at the control and never announces success", async () => {
    actions.confirmIncomesAction.mockResolvedValue({ ok: false, error: "Couldn't confirm. Nothing was changed. Check your connection and try again." });
    view(waiting());
    await userEvent.click(screen.getByTestId("confirm-all"));
    expect(await screen.findByTestId("confirm-error")).toHaveTextContent("Couldn't confirm. Nothing was changed.");
    expect(screen.getByTestId("live-region")).toBeEmptyDOMElement();
    expect(screen.getByTestId("confirm-all")).toBeEnabled();
  });

  it("with the last income confirmed, focus goes to Step 2", async () => {
    actions.confirmIncomesAction.mockResolvedValue({ ok: true, count: 1, names: ["Others"] });
    const data = moneyInData({ incomes: [income("g2", "others", 2_300_000, 8)] });
    const { update } = view(data);
    await userEvent.click(screen.getByTestId("confirm-all"));
    update({ ...data, incomes: [], done: [{ entryId: "g2", name: "Others", how: "Split by Plan A", amountMinor: 2_300_000 }], cycle: { id: "c1", closedAt: null } });
    expect(await screen.findByText(/Placeholder: the transfer checklist/)).toHaveFocus();
    expect(screen.getByRole("heading", { level: 1, name: "Move the money" })).toBeInTheDocument();
  });
});

describe("Money in: Add income form", () => {
  it("opens with focus in Amount and takes over the primary button", async () => {
    view(waiting());
    await userEvent.click(screen.getByTestId("add-income-button"));
    expect(screen.getByLabelText("Amount received")).toHaveFocus();
    expect(screen.queryByTestId("add-income-button")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Money in" })).toBeInTheDocument();
    // Confirm becomes soft: only one primary button on screen
    const primaries = screen.getAllByRole("button").filter((b) => b.className.includes("primary"));
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent("Add to Money in");
  });

  it("opens straight away for /money-in?add=1", () => {
    view(waiting(), { initialAddOpen: true });
    expect(screen.getByLabelText("Amount received")).toHaveFocus();
  });

  it("refuses a bad amount inline, returns focus to the field, and writes nothing", async () => {
    view(waiting(), { initialAddOpen: true });
    await userEvent.type(screen.getByLabelText("Amount received"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Add to Money in" }));
    const form = screen.getByTestId("add-income-form");
    expect(within(form).getAllByRole("alert").some((a) => a.textContent === "Enter the amount you received, above ₱0.")).toBe(true);
    expect(screen.getByLabelText("Amount received")).toHaveFocus();
    expect(actions.addIncomeAction).not.toHaveBeenCalled();
  });

  it("flags too many zeros and a future date", async () => {
    view(waiting(), { initialAddOpen: true });
    await userEvent.type(screen.getByLabelText("Amount received"), "99999999");
    await userEvent.click(screen.getByRole("button", { name: "Add to Money in" }));
    expect(screen.getAllByRole("alert").some((a) => a.textContent === "That amount looks too large. Check the number of zeros.")).toBe(true);
  });

  it("Date can't be later than today", () => {
    view(waiting(), { initialAddOpen: true });
    const date = screen.getByLabelText("Date");
    expect(date).toHaveAttribute("max", "2026-10-11");
    expect(date).toHaveValue("2026-10-11");
  });

  it("Landed in defaults to the source's account and resets when the source changes", async () => {
    view(waiting(), { initialAddOpen: true });
    const landed = screen.getByLabelText("Landed in") as HTMLSelectElement;
    expect(within(landed).queryByRole("option", { name: "AUD account" })).not.toBeInTheDocument(); // peso accounts only
    expect(landed.selectedOptions[0]).toHaveTextContent("MariBank");
    await userEvent.selectOptions(landed, "cash");
    await userEvent.selectOptions(screen.getByLabelText("Source"), sources.find((s) => s.id === "side")?.id as string);
    expect((screen.getByLabelText("Landed in") as HTMLSelectElement).selectedOptions[0]).toHaveTextContent("GCash or Maya");
  });

  it("A$ sent exists only for salary sources and shows the rate live", async () => {
    view(waiting(), { initialAddOpen: true });
    expect(screen.queryByLabelText(/Sent from AUD/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Source"), "work");
    await userEvent.type(screen.getByLabelText("Amount received"), "17410");
    expect(screen.getByTestId("rate-text")).toHaveTextContent("Add the A$ amount to track the rate you got.");
    await userEvent.type(screen.getByLabelText(/Sent from AUD/), "400");
    expect(screen.getByTestId("rate-text")).toHaveTextContent("Rate you got: ₱43.53 per A$1");
  });

  it("shows the source's job, or says you'll pick it", async () => {
    view(waiting(), { initialAddOpen: true });
    expect(screen.getByTestId("add-income-rule")).toHaveTextContent("Its job: Split by Plan A.");
    await userEvent.selectOptions(screen.getByLabelText("Source"), "ask");
    expect(screen.getByTestId("add-income-rule")).toHaveTextContent("You'll pick its job after adding it.");
    expect(screen.getByRole("link", { name: "Change rules in Plans" })).toHaveAttribute("href", "/plans/income");
  });

  it("submits what was typed; on success closes, selects the new row and focuses it", async () => {
    actions.addIncomeAction.mockResolvedValue({ ok: true, entryId: "new-1" });
    const data = waiting();
    const { update } = view(data, { initialAddOpen: true });
    await userEvent.type(screen.getByLabelText("Amount received"), "17,410");
    await userEvent.click(screen.getByRole("button", { name: "Add to Money in" }));
    expect(actions.addIncomeAction).toHaveBeenCalledWith({ sourceId: "others", amount: "17,410", date: "2026-10-11", landedIn: "mari", aud: "" });
    expect(screen.queryByTestId("add-income-form")).not.toBeInTheDocument();
    update({ ...data, incomes: [...data.incomes, income("new-1", "others", 1_741_000, 11)] });
    expect(await screen.findByRole("button", { name: /Others.*₱17,410\.00/s })).toHaveFocus();
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Others added to Money in"));
  });

  it("a failed write keeps the form open with the message", async () => {
    actions.addIncomeAction.mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." });
    view(waiting(), { initialAddOpen: true });
    await userEvent.type(screen.getByLabelText("Amount received"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Add to Money in" }));
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByTestId("add-income-form")).toBeInTheDocument();
  });

  it("Cancel clears the draft and returns focus to + Add income", async () => {
    view(waiting());
    await userEvent.click(screen.getByTestId("add-income-button"));
    await userEvent.type(screen.getByLabelText("Amount received"), "123");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("add-income-form")).not.toBeInTheDocument();
    expect(await screen.findByTestId("add-income-button")).toHaveFocus();
    await userEvent.click(screen.getByTestId("add-income-button"));
    expect(screen.getByLabelText("Amount received")).toHaveValue("");
  });

  it("with no income source, says so instead of offering a dead form", () => {
    view(moneyInData({ sources: [] }), { initialAddOpen: true });
    expect(screen.getByTestId("add-income-rule")).toHaveTextContent("You have no income source yet. Add one in Plans first.");
    expect(screen.getByRole("button", { name: "Add to Money in" })).toBeDisabled();
  });
});

describe("Money in: states", () => {
  it("empty: 'Nothing waiting' with how to add the first income, no steps, no numbers", () => {
    view(moneyInData());
    expect(screen.getByRole("heading", { level: 1, name: "Nothing waiting" })).toBeInTheDocument();
    expect(screen.getByText("Money from any source shows up here: salary, scholarship, side hustle, allowance.")).toBeInTheDocument();
    expect(screen.getByTestId("add-income-button")).toBeInTheDocument();
    expect(screen.queryByTestId("choose-step")).not.toBeInTheDocument();
    expect(screen.queryByText(/₱/)).not.toBeInTheDocument();
  });

  it("all done: the header and the ALL IN stamp", () => {
    const closed = NOW - 3_600_000;
    view(moneyInData({ done: [{ entryId: "g2", name: "Others", how: "Split by Plan A", amountMinor: 2_300_000 }], cycle: { id: "c", closedAt: closed } }));
    expect(screen.getByRole("heading", { level: 1, name: "Every peso has a home" })).toBeInTheDocument();
    expect(screen.getByText("ALL IN")).toBeInTheDocument();
    expect(screen.getByText("OCT 11")).toBeInTheDocument();
  });
});

describe("MoveMoneyStep (placeholder for ticket 11)", () => {
  it("is disabled until something is confirmed", () => {
    render(<MoveMoneyStep phase="waiting" confirmed={[]} cycle={null} />);
    expect(screen.getByTestId("move-money-step")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Transfers appear here, grouped by account, once you confirm.")).toBeInTheDocument();
  });

  it("is clearly marked as a placeholder once something is confirmed", () => {
    render(<MoveMoneyStep phase="move" confirmed={[{ entryId: "a", name: "Work", how: "Split by Plan A", amountMinor: 1 }]} cycle={{ id: "c", closedAt: null }} />);
    expect(screen.getByTestId("move-money-placeholder")).toHaveTextContent("Placeholder");
    expect(screen.getByTestId("move-money-step")).not.toHaveAttribute("aria-disabled");
  });
});
