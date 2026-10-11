import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MoneyInView } from "@/components/money-in/MoneyInView";
import { MOVE_MONEY_FOCUS_ID, MoveMoneyStep } from "@/components/money-in/MoveMoneyStep";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import type { MoneyInData } from "@/lib/data/money-in-model";
import { G2_ALLOCS, G5_ALLOCS, accounts, buckets, moneyInData, planRows } from "@/lib/data/money-in-testkit";

const actions = vi.hoisted(() => ({ tickTransferAction: vi.fn(), untickTransferAction: vi.fn() }));
vi.mock("@/lib/actions/transfers", () => actions);
vi.mock("@/lib/actions/money-in", () => ({ addIncomeAction: vi.fn(), confirmIncomesAction: vi.fn() }));

const NOW = Date.UTC(2026, 9, 11, 6, 0, 0);
const DONE = [
  { entryId: "g2", name: "Work", how: "Split by Plan A", amountMinor: 2_300_000 },
  { entryId: "g5", name: "Side hustle", how: "Own split", amountMinor: 350_000 },
];
const G7 = [...G2_ALLOCS, ...G5_ALLOCS];

function step(over: Partial<React.ComponentProps<typeof MoveMoneyStep>> = {}) {
  const props = { phase: "move" as const, confirmed: DONE, cycle: { id: "c1", closedAt: null }, transferPlan: planRows(G7), accounts, buckets, ...over };
  const ui = (p: typeof props) => (
    <LiveRegionProvider>
      <MoveMoneyStep {...p} />
    </LiveRegionProvider>
  );
  const r = render(ui(props));
  return { ...r, update: (o: Partial<typeof props>) => r.rerender(ui({ ...props, ...o })) };
}

beforeEach(() => {
  actions.tickTransferAction.mockReset();
  actions.untickTransferAction.mockReset();
});

describe("Step 2: Move the money", () => {
  it("is disabled until something is confirmed", () => {
    step({ phase: "waiting", confirmed: [], cycle: null, transferPlan: [] });
    expect(screen.getByTestId("move-money-step")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Transfers appear here, grouped by account, once you confirm.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("G7: keep rows (no checkbox) first, then five transfer rows, '0 of 5 sent'", () => {
    step();
    const keeps = screen.getAllByTestId("keep-row");
    expect(keeps).toHaveLength(2);
    expect(within(keeps[0]).getByText("Keep ₱10,240.00 in MariBank")).toBeInTheDocument();
    expect(within(keeps[0]).getByText(/already there · includes ₱350.00 kept by netting/)).toBeInTheDocument();
    expect(within(keeps[0]).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(screen.getByTestId("sent-count")).toHaveTextContent("0 of 5 sent");
    const net = screen.getByRole("checkbox", { name: "Send ₱1,950.00 to GCash or Maya" });
    expect(net).not.toBeChecked();
    expect(screen.getByText(/₱350.00 less: that much stays put on the other side/)).toBeInTheDocument();
    expect(screen.getByText("Investments · from MariBank")).toBeInTheDocument();
  });

  it("puts the focus id on the first transfer checkbox only", () => {
    step();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toHaveAttribute("id", MOVE_MONEY_FOCUS_ID);
    expect(document.querySelectorAll(`#${MOVE_MONEY_FOCUS_ID}`)).toHaveLength(1);
  });

  it("ticking calls the action with the running total, shows Sent and announces what is left", async () => {
    actions.tickTransferAction.mockResolvedValue({ ok: true, already: false });
    step();
    const box = screen.getByRole("checkbox", { name: "Send ₱6,900.00 to Pag-IBIG MP2" });
    await userEvent.click(box);
    expect(actions.tickTransferAction).toHaveBeenCalledWith({ from: "mari", to: "mp2", amount: 690_000 });
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Sent. 4 to go."));
  });

  it("shows the optimistic state, the Sent stamp and the count while the write is in flight", async () => {
    let finish: (v: unknown) => void = () => {};
    actions.tickTransferAction.mockReturnValue(new Promise((r) => (finish = r)));
    step();
    const box = screen.getByRole("checkbox", { name: "Send ₱6,900.00 to Pag-IBIG MP2" });
    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByTestId("sent-count")).toHaveTextContent("1 of 5 sent");
    await act(async () => finish({ ok: true, already: false }));
  });

  it("a failed tick restores the box, says why at the control and announces no success", async () => {
    actions.tickTransferAction.mockResolvedValue({ ok: false, error: "Couldn't save that transfer. Nothing was changed. Check your connection and try again." });
    step();
    const box = screen.getByRole("checkbox", { name: "Send ₱6,900.00 to Pag-IBIG MP2" });
    await userEvent.click(box);
    expect(await screen.findByTestId("move-error")).toHaveTextContent("Couldn't save that transfer");
    await waitFor(() => expect(box).not.toBeChecked());
    expect(screen.queryByText("Sent")).not.toBeInTheDocument();
    expect(screen.getByTestId("live-region")).not.toHaveTextContent("Sent.");
  });

  it("'already ticked' (double click, retry) is not an error", async () => {
    actions.tickTransferAction.mockResolvedValue({ ok: true, already: true });
    step();
    await userEvent.click(screen.getByRole("checkbox", { name: "Send ₱6,900.00 to Pag-IBIG MP2" }));
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Sent."));
    expect(screen.getByTestId("move-error")).toBeEmptyDOMElement();
  });

  it("Space toggles the focused checkbox", async () => {
    actions.tickTransferAction.mockResolvedValue({ ok: true, already: false });
    step();
    await userEvent.tab();
    const first = screen.getAllByRole("checkbox")[0];
    expect(first).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(actions.tickTransferAction).toHaveBeenCalledTimes(1);
  });

  it("a sent row is checked with its stamp; unticking calls untick and announces", async () => {
    actions.untickTransferAction.mockResolvedValue({ ok: true, already: false });
    step({ transferPlan: planRows(G7, [{ fromAccountId: "mari", toAccountId: "mp2", sentMinor: 690_000 }]) });
    const box = screen.getByRole("checkbox", { name: "Send ₱6,900.00 to Pag-IBIG MP2" });
    expect(box).toBeChecked();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByTestId("sent-count")).toHaveTextContent("1 of 5 sent");
    await userEvent.click(box);
    expect(actions.untickTransferAction).toHaveBeenCalledWith({ from: "mari", to: "mp2" });
    expect(actions.tickTransferAction).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Unticked. 5 transfers to send."));
  });

  it("partial: 'Send ₱190.00 more' with '₱1,610.00 already sent', ticking sends the new running total, and it can be undone", async () => {
    actions.tickTransferAction.mockResolvedValue({ ok: true, already: false });
    actions.untickTransferAction.mockResolvedValue({ ok: true, already: false });
    const plan = planRows([...G2_ALLOCS, { from: "mari", hue: "living", amount: 19_000 }], [{ fromAccountId: "mari", toAccountId: "cash", sentMinor: 161_000 }]);
    step({ transferPlan: plan });
    const box = screen.getByRole("checkbox", { name: "Send ₱190.00 more to GCash / cash" });
    expect(box).not.toBeChecked();
    expect(screen.getByText("Living · from MariBank · ₱1,610.00 already sent")).toBeInTheDocument();
    await userEvent.click(box);
    expect(actions.tickTransferAction).toHaveBeenCalledWith({ from: "mari", to: "cash", amount: 180_000 });
    await userEvent.click(screen.getByRole("button", { name: "Undo the ₱1,610.00 sent" }));
    expect(actions.untickTransferAction).toHaveBeenCalledWith({ from: "mari", to: "cash" });
  });

  it("all done: the step is replaced by the completion card, which holds the focus id on its button", () => {
    step({ phase: "all_done", cycle: { id: "c1", closedAt: NOW }, transferPlan: planRows(G7) });
    expect(screen.queryByTestId("move-money-step")).not.toBeInTheDocument();
    const card = screen.getByTestId("completion-card");
    expect(within(card).getByRole("heading", { name: "All money in has a home." })).toBeInTheDocument();
    expect(card).toHaveTextContent("₱26,500.00 from 2 sources now has a job");
    expect(card).toHaveTextContent("Your accounts match your buckets");
    const link = within(card).getByRole("link", { name: /See your buckets grow/ });
    expect(link).toHaveAttribute("href", "/today");
    expect(link).toHaveAttribute("id", MOVE_MONEY_FOCUS_ID);
    // opened already complete: no burst, no stealing focus
    expect(screen.queryByTestId("burst")).not.toBeInTheDocument();
    expect(link).not.toHaveFocus();
  });

  it("when the last transfer finishes in this session: one burst, focus on the button, announced", async () => {
    const { update } = step();
    update({ phase: "all_done", cycle: { id: "c1", closedAt: NOW }, transferPlan: planRows(G7) });
    const link = await screen.findByRole("link", { name: /See your buckets grow/ });
    expect(link).toHaveFocus();
    expect(screen.getByTestId("burst")).toHaveAttribute("aria-hidden", "true");
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("All money in has a home."));
  });
});

describe("Money in screen with Step 2", () => {
  const base = (over: Partial<MoneyInData> = {}) => moneyInData({ done: DONE, cycle: { id: "c1", closedAt: null }, transferPlan: planRows(G7), ...over });

  it("shows the checklist under the header 'Move the money'", () => {
    render(
      <LiveRegionProvider>
        <MoneyInView data={base()} nowMs={NOW} />
      </LiveRegionProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Move the money" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
  });

  it("all transfers sent today shows the completion card and the ALL IN slip", () => {
    render(
      <LiveRegionProvider>
        <MoneyInView data={base({ cycle: { id: "c1", closedAt: NOW - 3_600_000 } })} nowMs={NOW} />
      </LiveRegionProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Every peso has a home" })).toBeInTheDocument();
    expect(screen.getByTestId("completion-card")).toBeInTheDocument();
    expect(screen.getByText("ALL IN")).toBeInTheDocument();
  });
});
