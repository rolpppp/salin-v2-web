import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoriesData } from "@/lib/data/categories";

const actions = vi.hoisted(() => ({
  addCategoryAction: vi.fn(),
  moveCategoryAction: vi.fn(),
  removeCategoryAction: vi.fn(),
  renameCategoryAction: vi.fn(),
}));
vi.mock("@/lib/actions/categories", () => actions);

import { CategoriesPanel } from "@/components/plans/categories/CategoriesPanel";

const buckets = [
  { id: "b-living", name: "Living" },
  { id: "b-fun", name: "Fun" },
];
const data: CategoriesData = {
  monthLabel: "October",
  hasCategories: true,
  buckets,
  groups: [
    {
      id: "b-living",
      name: "Living",
      hue: "living",
      monthMinor: 13_000,
      categories: [
        { id: "c-groc", name: "Groceries", monthMinor: 13_000, monthEntries: 2, inUseReason: "it has entries", olderIn: [] },
        { id: "c-new", name: "Brand new", monthMinor: 0, monthEntries: 0, inUseReason: null, olderIn: [] },
      ],
      moved: [{ categoryId: "c-load", categoryName: "Load & data", nowIn: "Fun", totalMinor: 15_000 }],
    },
    {
      id: "b-fun",
      name: "Fun",
      hue: "fun",
      monthMinor: 0,
      categories: [{ id: "c-load", name: "Load & data", monthMinor: 0, monthEntries: 0, inUseReason: "it has entries", olderIn: ["Living"] }],
      moved: [],
    },
  ],
};

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
});

describe("CategoriesPanel", () => {
  it("groups by bucket with 'spent in {month}', this-month totals and entry counts", () => {
    render(<CategoriesPanel data={data} />);
    const living = screen.getByTestId("cat-group-Living");
    expect(within(living).getByTestId("group-spent")).toHaveTextContent("₱130.00 spent in October");
    expect(within(living).getByText("2 entries")).toBeInTheDocument();
    expect(screen.getByTestId("cat-group-Fun")).toHaveTextContent("Nothing spent yet");
    expect(screen.getByText(/Moving a category changes where/)).toHaveTextContent("new");
  });

  it("shows the 'logged before the move' line on the old bucket (BR 6.2) and where older entries sit", () => {
    render(<CategoriesPanel data={data} />);
    expect(screen.getByTestId("moved-line")).toHaveTextContent("₱150.00 from Load & data (now in Fun), logged before the move");
    expect(within(screen.getByTestId("cat-group-Fun")).getByText("Older entries in Living")).toBeInTheDocument();
  });

  it("Remove only when there are no entries; otherwise 'Has entries'", async () => {
    actions.removeCategoryAction.mockResolvedValueOnce({ ok: true });
    render(<CategoriesPanel data={data} />);
    expect(screen.getAllByText("Has entries")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Remove Groceries" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Brand new" }));
    expect(actions.removeCategoryAction).toHaveBeenCalledWith({ id: "c-new" });
  });

  it("Move to {bucket} calls the move action; on failure the select goes back and the error shows", async () => {
    actions.moveCategoryAction.mockResolvedValueOnce({ ok: false, error: "That item isn't there any more. Reload the page and try again." });
    render(<CategoriesPanel data={data} />);
    const select = screen.getByRole("combobox", { name: "Move Brand new to" });
    expect(within(select).getByRole("option", { name: "In Living" })).toBeInTheDocument();
    await userEvent.selectOptions(select, "b-fun");
    expect(actions.moveCategoryAction).toHaveBeenCalledWith({ id: "c-new", bucketId: "b-fun" });
    expect(await screen.findByText(/isn't there any more/)).toBeInTheDocument();
    expect(select).toHaveValue("b-living");
  });

  it("adds a category inside a bucket, clearing the field on success", async () => {
    actions.addCategoryAction.mockResolvedValueOnce({ ok: true, value: { id: "n" } });
    render(<CategoriesPanel data={data} />);
    const input = screen.getByRole("textbox", { name: "New category in Fun" });
    await userEvent.type(input, "Streaming");
    await userEvent.click(screen.getByRole("button", { name: "Add category to Fun" }));
    expect(actions.addCategoryAction).toHaveBeenCalledWith({ name: "Streaming", bucketId: "b-fun" });
    await vi.waitFor(() => expect(input).toHaveValue(""));
  });

  it("renames inline", async () => {
    actions.renameCategoryAction.mockResolvedValueOnce({ ok: true });
    render(<CategoriesPanel data={data} />);
    const input = screen.getByRole("textbox", { name: "Category name for Brand new" });
    await userEvent.clear(input);
    await userEvent.type(input, "Dining out{Enter}");
    expect(actions.renameCategoryAction).toHaveBeenCalledWith({ id: "c-new", name: "Dining out" });
  });

  it("an unmapped category asks for a bucket", () => {
    render(
      <CategoriesPanel
        data={{
          ...data,
          groups: [{ id: null, name: "Not in a bucket yet", hue: null, monthMinor: 0, moved: [], categories: [{ id: "c-x", name: "Misc", monthMinor: 0, monthEntries: 0, inUseReason: null, olderIn: [] }] }],
        }}
      />,
    );
    expect(within(screen.getByRole("combobox", { name: "Move Misc to" })).getByRole("option", { name: "Choose a bucket" })).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: /New category in/ })).not.toBeInTheDocument();
  });

  it("with no buckets: explains what to do first and shows no numbers", () => {
    render(<CategoriesPanel data={{ groups: [], buckets: [], monthLabel: "October", hasCategories: false }} />);
    expect(screen.getByRole("heading", { name: "No buckets yet" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("₱");
  });
});
