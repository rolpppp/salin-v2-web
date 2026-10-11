import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { TodayView } from "@/components/today/TodayView";
import { income } from "@/lib/data/money-in-testkit";
import { buildTodayView, type TodayInput } from "@/lib/data/today-model";
import { BUCKET, G1, G2, allocsOf, flowsOf, g9, ms } from "@/lib/data/today-testkit";

const cover = vi.fn();
vi.mock("@/lib/actions/covers", () => ({ coverFromBuffer: (...a: unknown[]) => cover(...a) }));

function renderToday(input: TodayInput = g9()) {
  return render(
    <LiveRegionProvider>
      <TodayView view={buildTodayView(input)} logSlot={null} />
    </LiveRegionProvider>,
  );
}

beforeEach(() => cover.mockReset());

describe("Today", () => {
  it("shows the G9 numbers: safe to spend ₱345.43, ₱34 a day for 10 days, Living needs ₱86.97", () => {
    renderToday();
    expect(screen.getByTestId("safe-amount")).toHaveTextContent("₱345.43");
    expect(screen.getByTestId("per-day")).toHaveTextContent("About ₱34 a day for 10 days");
    expect(screen.getByTestId("slot-living")).toHaveAccessibleName(/Living: needs ₱86\.97, kept in GCash \/ cash/);
    expect(within(screen.getByTestId("slot-living")).getByText("Needs ₱86.97")).toBeInTheDocument();
    expect(screen.getByTestId("slot-living")).toHaveTextContent("−₱86.97");
    expect(screen.getByTestId("slot-living").querySelector('[data-testid="ribbon"]')).toBeNull();
    expect(screen.getByText("Put away in October")).toBeInTheDocument();
    expect(screen.getByText("Set aside for tax")).toBeInTheDocument();
  });

  it("a negative safe to spend shows the minus in coral and per day stays at ₱0", () => {
    renderToday(g9({ flows: flowsOf(G1, { living: 130_000, fun: 300_000 }) }));
    const big = screen.getByTestId("safe-amount");
    expect(big.textContent?.startsWith("−")).toBe(true);
    expect(screen.getByTestId("per-day")).toHaveTextContent("About ₱0 a day for 10 days");
  });

  it("has exactly one primary button in the next step card, and none for done", () => {
    renderToday(g9({ incomes: [income("a", "work", 100_000, 9)] }));
    const card = screen.getByTestId("next-card");
    expect(within(card).getAllByTestId("next-primary")).toHaveLength(1);
    expect(within(card).getByRole("link", { name: /Give it a job/ })).toHaveAttribute("href", "/money-in");
    expect(within(screen.getByTestId("next-chips")).getByText("Work")).toBeInTheDocument();
  });

  it("the week reads '3 of 5 done' with the five steps", () => {
    renderToday();
    expect(screen.getByTestId("week-count")).toHaveTextContent("3 of 5 done");
    expect(screen.getByRole("progressbar", { name: "This week" })).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText("Living above zero")).toBeInTheDocument();
  });

  it("goals: shows Passed 25% today only after a confirm that crossed it", () => {
    const crossed = g9({
      flows: flowsOf({ ...G1, emergency: G1.emergency + G2.emergency }),
      allocations: [...allocsOf("g1", "work", G1, 7, 7), ...allocsOf("g2", "others", G2, 8, 11)],
    });
    renderToday(crossed);
    expect(screen.getByTestId("passed-chip")).toHaveTextContent("Passed 25% today");
    expect(screen.getByTestId("goal-sub")).toHaveTextContent("₱37,094.72 to go. About 7 more paydays like Oct 7");
    expect(screen.getByRole("progressbar", { name: "Emergency fund" })).toHaveAttribute("aria-valuetext", "25% saved");
  });

  it("goals: no goals shows one inviting line linking to Plans → Goals", () => {
    renderToday(g9({ goals: [] }));
    expect(screen.getByTestId("goals-empty")).toHaveTextContent("Saving toward something?");
    expect(screen.getByRole("link", { name: "Add a goal in Plans" })).toHaveAttribute("href", "/plans/goals");
  });

  it("the legend says jobless income is previewed as the active plan", () => {
    renderToday(g9({ incomes: [income("w-gift", "ask", 5_000, 10)] }));
    expect(screen.getByTestId("shelf-legend-preview")).toHaveTextContent("Where the ₱50.00 waiting would go (Gift shown as Plan A)");
  });

  it("buckets with no plan, source or money are not on the shelf", () => {
    renderToday();
    expect(screen.queryByTestId("slot-dost")).toBeNull();
    expect(screen.getByTestId("slot-rent")).toHaveTextContent("Starts Jan 2027");
  });
});

describe("bucket drawer", () => {
  it("opens from a bucket, focuses Close, shows left, plan text and the slip, closes on Escape and returns focus", async () => {
    renderToday();
    const slot = screen.getByTestId("slot-living");
    await userEvent.click(slot);
    const dialog = await screen.findByRole("dialog", { name: "Living" });
    expect(within(dialog).getByTestId("drawer-left")).toHaveTextContent("−₱86.97");
    expect(within(dialog).getByText("Kept in GCash / cash")).toBeInTheDocument();
    expect(within(dialog).getByText(/7% of each payday on Plan A, 7% on Plan B/)).toBeInTheDocument();
    expect(within(dialog).getByText("Oct 7 Work")).toBeInTheDocument();
    expect(within(dialog).getByText("+₱1,213.03")).toBeInTheDocument();
    expect(within(dialog).getByText("−₱1,300.00")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cover ₱86.97 from Buffer" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(slot).toHaveFocus();
  });

  it("offers no cover on a bucket that isn't below zero", async () => {
    renderToday();
    await userEvent.click(screen.getByTestId("slot-fun"));
    const dialog = await screen.findByRole("dialog", { name: "Fun money" });
    expect(within(dialog).queryByRole("button", { name: /Cover/ })).toBeNull();
  });

  it("Scholarship says it isn't part of the split; Rent says where its share goes", async () => {
    const withScholarship = g9();
    withScholarship.flows[BUCKET.dost] = { allocated: 100_000, spent: 0, coversIn: 0, coversOut: 0, left: 100_000 };
    renderToday(withScholarship);
    await userEvent.click(screen.getByTestId("slot-dost"));
    expect(await screen.findByText(/Not part of the payday split/)).toBeInTheDocument();
  });
});

describe("Cover from Buffer", () => {
  it("covers from the drawer, shows the flag and announces it", async () => {
    cover.mockResolvedValue({ ok: true, coveredMinor: 8697, stillNeedsMinor: 0 });
    renderToday();
    await userEvent.click(screen.getByTestId("slot-living"));
    await userEvent.click(await screen.findByRole("button", { name: "Cover ₱86.97 from Buffer" }));
    expect(cover).toHaveBeenCalledWith({ toBucketId: BUCKET.living });
    await waitFor(() => expect(screen.getByTestId("cover-flag")).toHaveTextContent("Covered. Buffer topped up Living by ₱86.97."));
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Covered. Buffer topped up Living by ₱86.97."));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("covers from the next step card and keeps focus on the card", async () => {
    cover.mockResolvedValue({ ok: true, coveredMinor: 8697, stillNeedsMinor: 0 });
    renderToday();
    await userEvent.click(screen.getByRole("button", { name: "Cover from Buffer" }));
    await waitFor(() => expect(screen.getByTestId("cover-flag")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("next-card")).toHaveFocus());
  });

  it("names what's still needed when Buffer was short", async () => {
    cover.mockResolvedValue({ ok: true, coveredMinor: 5000, stillNeedsMinor: 3697 });
    renderToday();
    await userEvent.click(screen.getByRole("button", { name: "Cover from Buffer" }));
    await waitFor(() => expect(screen.getByTestId("cover-flag")).toHaveTextContent("Living still needs ₱36.97"));
  });

  it("a failed write shows the message at the control and never a success flag (SPEC §6)", async () => {
    cover.mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." });
    renderToday();
    await userEvent.click(screen.getByRole("button", { name: "Cover from Buffer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Check your connection and try again.");
    expect(screen.queryByTestId("cover-flag")).toBeNull();
  });

  it("with Buffer empty there is no cover button, only See what happened", () => {
    renderToday(g9({ flows: flowsOf({ ...G1, buffer: 0 }, { living: 130_000 }) }));
    expect(screen.queryByRole("button", { name: /Cover from/ })).toBeNull();
    expect(screen.getByRole("button", { name: "See what happened" })).toBeInTheDocument();
  });

  it("See what happened opens the Living drawer", async () => {
    renderToday();
    await userEvent.click(screen.getByRole("button", { name: "See what happened" }));
    expect(await screen.findByRole("dialog", { name: "Living" })).toBeInTheDocument();
  });
});

describe("all done", () => {
  it("shows the finished card with dates and no buttons", () => {
    renderToday(g9({ weekClosed: true, flows: flowsOf(G1, {}), spendingThisMonth: [], nowMs: ms(11) }));
    const card = screen.getByTestId("next-card");
    expect(card).toHaveTextContent("Every peso has a job this week.");
    expect(card).toHaveTextContent("Next review is Sunday, Oct 18. Your next payday is Oct 21.");
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).queryByRole("link")).toBeNull();
    expect(screen.getByTestId("week-count")).toHaveTextContent("5 of 5 done");
  });
});
