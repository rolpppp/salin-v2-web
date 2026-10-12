import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { ReviewView } from "@/components/review/ReviewView";
import type { ReviewBucket, ReviewData } from "@/lib/data/review-model";

const actions = vi.hoisted(() => ({
  closeWeekAction: vi.fn(),
  coverFromBufferAction: vi.fn(),
  nudgeFunToLivingAction: vi.fn(),
  trackReviewOpenedAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/actions/review", () => actions);

const bucket = (hue: string, groupKey: string, over: Partial<ReviewBucket> = {}): ReviewBucket => ({
  id: `id-${hue}`,
  name: hue === "fun" ? "Fun money" : hue === "emergency" ? "Emergency fund" : hue[0].toUpperCase() + hue.slice(1),
  shortName: null,
  groupKey,
  hue,
  isArchived: false,
  leftMinor: 0,
  spentWeekMinor: 0,
  coversInWeekMinor: 0,
  changeWeekMinor: 0,
  changeLastWeekMinor: 0,
  ...over,
});

/** G9's starting state: Living left −8,697 (Needs ₱86.97), Fun 43,240, safe 34,543. */
function week(over: Partial<ReviewData> = {}): ReviewData {
  return {
    firstName: "Maria",
    weekStart: "2026-10-05",
    weekEnd: "2026-10-11",
    weekStartsOn: 1,
    reviewDay: 0,
    todayIso: "2026-10-11",
    buckets: [
      bucket("living", "spend", { leftMinor: -8_697, spentWeekMinor: 130_000 }),
      bucket("fun", "spend", { leftMinor: 43_240, spentWeekMinor: 130_050 }),
      bucket("emergency", "save", { leftMinor: 554_528, changeWeekMinor: 554_528 }),
      bucket("buffer", "set_aside", { leftMinor: 86_645 }),
    ],
    categories: [{ bucketId: "id-living", name: "Groceries", amountMinor: 61_250 }],
    sources: [{ name: "Work", amountMinor: 935_766 }],
    cameInWeekMinor: 935_766, // = spent 260,050 + put away 554,528 + cushions 86,645 + safe 34,543
    carriedInMinor: 0,
    spentWeekMinor: 260_050,
    toAssignMinor: 0,
    hasHistory: false,
    waitingCount: 0,
    anyConfirmed: true,
    pendingTransfers: 2,
    livingPlanBp: 700,
    emergency: { bucketId: "id-emergency", savedMinor: 554_528, targetMinor: 5_000_000 },
    closed: null,
    ...over,
  };
}

const view = (d: ReviewData) =>
  render(
    <LiveRegionProvider>
      <ReviewView data={d} />
    </LiveRegionProvider>,
  );

beforeEach(() => vi.clearAllMocks());

describe("Review screen", () => {
  it("shows the week header, stepper, slip, one observation and the three checks", () => {
    view(week());
    expect(screen.getByRole("heading", { level: 1, name: "Week of Oct 5 – 11" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Review progress" })).toHaveTextContent("Look back");
    const slip = screen.getByRole("group", { name: "Week slip" });
    expect(within(slip).getByText("Safe to spend")).toBeInTheDocument();
    expect(within(slip).getByTestId("slip-footer")).toHaveTextContent("no earlier week to compare yet");
    expect(screen.queryByTestId("slip-mismatch")).toBeNull();
    expect(screen.getByTestId("observation")).toHaveTextContent("Living ran ₱86.97 short. Groceries was ₱612.50 of the ₱1,300.00 spent.");
    expect(screen.getAllByRole("button", { name: "Close the week" })).toHaveLength(1);
    expect(within(screen.getByTestId("close-checks")).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/You can close with open items\. They carry into next week\./)).toBeInTheDocument();
    expect(screen.queryByTestId("week-closed")).toBeNull();
  });

  it("says so, out loud, when the slip does not add up", () => {
    view(week({ cameInWeekMinor: 1 }));
    expect(screen.getByTestId("slip-mismatch")).toHaveTextContent(/Something changed in your records/);
  });

  it("an empty week says how to log spending", () => {
    view(
      week({
        buckets: [bucket("living", "spend"), bucket("fun", "spend"), bucket("buffer", "set_aside")],
        cameInWeekMinor: 0,
        spentWeekMinor: 0,
        categories: [],
      }),
    );
    expect(screen.getByTestId("spend-empty")).toHaveTextContent("Nothing logged this week. Log spending on your phone and it shows here.");
  });

  it("Emergency progress shows this week's change and the Plan B percent", () => {
    view(week());
    expect(screen.getByTestId("emergency-change")).toHaveTextContent("+₱5,545.28");
    expect(screen.getByTestId("emergency-note")).toHaveTextContent("11% of the ₱50,000 that switches you to Plan B.");
  });

  it("Cover from Buffer announces what moved and keeps focus on the observation", async () => {
    actions.coverFromBufferAction.mockResolvedValue({ ok: true, coveredMinor: 8_697, stillNeedsMinor: 0 });
    view(week());
    await userEvent.click(screen.getByRole("button", { name: "Cover from Buffer" }));
    expect(actions.coverFromBufferAction).toHaveBeenCalledWith({ toBucketId: "id-living" });
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Covered Living with ₱86.97 from Buffer."));
    await waitFor(() => expect(screen.getByRole("heading", { name: "One thing to look at" })).toHaveFocus());
  });

  it("Move 1% from Fun to Living names the plans that changed", async () => {
    actions.nudgeFunToLivingAction.mockResolvedValue({
      ok: true,
      plans: ["Plan A", "Saving for Japan"],
      fromName: "Fun money",
      toName: "Living",
    });
    view(week());
    await userEvent.click(screen.getByRole("button", { name: "Move 1% from Fun to Living" }));
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Moved 1% from Fun money to Living in Plan A and Saving for Japan. It starts with your next payday."));
  });

  it("a refused nudge shows the reason at the control", async () => {
    actions.nudgeFunToLivingAction.mockResolvedValue({ ok: false, error: "Fun money is at 0% in Plan B, so 1% can't move to Living. Change the split in Plans instead." });
    view(week());
    await userEvent.click(screen.getByRole("button", { name: "Move 1% from Fun to Living" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Plan B");
  });

  it("closing sends the week start and announces the real next start day", async () => {
    actions.closeWeekAction.mockResolvedValue({ ok: true, alreadyClosed: false, openItems: 2 });
    view(week());
    await userEvent.click(screen.getByRole("button", { name: "Close the week" }));
    expect(actions.closeWeekAction).toHaveBeenCalledWith(expect.objectContaining({ weekStart: "2026-10-05" }));
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Week closed. Monday starts fresh. 2 open items carry into next week."));
  });

  it("a closed week shows the stamp, the checks with carry-over, the safe amount and the next review", () => {
    view(
      week({
        buckets: [bucket("living", "spend", { leftMinor: 34_543 }), bucket("fun", "spend")],
        cameInWeekMinor: 34_543,
        spentWeekMinor: 0,
        closed: { checks: { assign: true, transfers: false, living: true }, safeToSpendMinor: 34_543, observation: null, closedDateIso: "2026-10-11" },
      }),
    );
    expect(screen.getByText("WEEK CLOSED")).toBeInTheDocument();
    const card = screen.getByTestId("week-closed");
    // opened already closed: no burst (it plays only when this view closed the week)
    expect(card).not.toHaveAttribute("data-burst");
    expect(within(card).getByRole("heading", { name: "Week closed. Monday starts fresh." })).toBeInTheDocument();
    expect(within(card).getByText(/Transfers made/).parentElement).toHaveTextContent("(carries into next week)");
    expect(within(card).getByTestId("start-next")).toHaveTextContent("You start next week with ₱345 safe to spend");
    expect(within(card).getByTestId("next-review")).toHaveTextContent("Next review: Sunday, October 18.");
    expect(screen.queryByRole("button", { name: "Close the week" })).toBeNull();
  });

  it("fires review_opened once", () => {
    const { rerender } = view(week());
    rerender(
      <LiveRegionProvider>
        <ReviewView data={week({ waitingCount: 1 })} />
      </LiveRegionProvider>,
    );
    expect(actions.trackReviewOpenedAction).toHaveBeenCalledTimes(1);
    expect(actions.trackReviewOpenedAction).toHaveBeenCalledWith("2026-10-05");
  });
});
