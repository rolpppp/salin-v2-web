import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ShelfSlot, ShelfView } from "@/lib/data/today-model";

vi.mock("@/lib/actions/onboarding", () => ({ startMakeAPlan: vi.fn() }));

import { Shelf } from "@/components/today/Shelf";

const slot = (over: Partial<ShelfSlot> = {}): ShelfSlot => ({
  id: "b-spend",
  name: "Spending",
  shortName: "Spending",
  hue: "living",
  keptIn: "Cash",
  leftMinor: 130_000,
  prevLeftMinor: 130_000,
  needsMinor: 0,
  ribbonBp: 928,
  tiny: false,
  pendingAddMinor: 0,
  pendingBp: 0,
  pendingLabelInside: false,
  tag: null,
  ariaLabel: "Spending: ₱1,300.00 left, kept in Cash",
  ...over,
});
const view = (slots: ShelfSlot[], tracking = true): ShelfView => ({
  groups: [{ key: "spend", title: "Spend", hint: "day to day", slots }],
  scaleMinor: 1_400_000,
  totalMinor: slots.reduce((t, s) => t + s.leftMinor, 0),
  preview: null,
  tracking,
});

describe("Shelf with one bucket", () => {
  it("draws one line (no ribbon, no scale note) and offers Make a plan when just tracking", () => {
    render(<Shelf shelf={view([slot()])} onOpen={() => {}} />);
    expect(screen.getByTestId("slot-living")).toHaveTextContent("₱1,300.00");
    expect(screen.getByTestId("slot-living")).toHaveTextContent("in Cash");
    expect(screen.queryByTestId("ribbon")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("full height is");
    expect(screen.getByRole("button", { name: /Make a plan/ })).toBeInTheDocument();
  });

  it("opens the bucket drawer on click", async () => {
    const onOpen = vi.fn();
    render(<Shelf shelf={view([slot()])} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Spending: ₱1,300.00 left, kept in Cash" }));
    expect(onOpen).toHaveBeenCalledWith("b-spend", expect.any(HTMLElement));
  });

  it("with a plan: no Make a plan; overspent shows Needs; waiting income is named", () => {
    render(<Shelf shelf={view([slot({ leftMinor: 0, needsMinor: 5_000, pendingAddMinor: 20_000 })], false)} onOpen={() => {}} />);
    expect(screen.queryByRole("button", { name: /Make a plan/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("slot-amount")).toHaveTextContent("Needs ₱50.00");
    expect(screen.getByTestId("slot-living")).toHaveTextContent("+₱200.00 waiting in Money in");
  });

  it("two buckets keep the ribbon shelf", () => {
    render(<Shelf shelf={view([slot(), slot({ id: "b-em", hue: "emergency", name: "Emergency fund", shortName: "Emergency" })])} onOpen={() => {}} />);
    expect(screen.getAllByTestId("ribbon")).toHaveLength(2);
    expect(document.body).toHaveTextContent("full height is ₱14,000");
  });
});
