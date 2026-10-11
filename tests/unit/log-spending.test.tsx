import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { LogSpendingLauncher } from "@/components/log-spending/LogSpendingLauncher";
import { groupCategories, type LogBucket, type LogSpendingData } from "@/lib/data/log-spending-model";

const actions = vi.hoisted(() => ({ logSpending: vi.fn() }));
vi.mock("@/lib/actions/spending", () => actions);

const bucket = (id: string, name: string, groupKey: LogBucket["groupKey"], displayOrder: number, keptInAccountId: string | null): LogBucket => ({
  id,
  name,
  groupKey,
  hue: id,
  keptInAccountId,
  displayOrder,
});

const data: LogSpendingData = {
  todayIso: "2026-10-11",
  homeCurrency: "PHP",
  groups: groupCategories(
    [bucket("living", "Living", "spend", 2, "gcash"), bucket("fun", "Fun money", "spend", 7, "mari"), bucket("tax", "Tax", "set_aside", 1, "mari")],
    [
      { id: "lunch", name: "Lunch", bucketId: "living" },
      { id: "movies", name: "Movies", bucketId: "fun" },
      { id: "taxes", name: "Taxes", bucketId: "tax" },
    ],
  ),
  lefts: { living: 950_000, fun: 200_000, tax: 10_000 },
  safeMinor: 1_150_000,
  daysUntilPayday: 4,
  accounts: [
    { id: "mari", name: "MariBank" },
    { id: "gcash", name: "GCash" },
  ],
};

const OK = {
  ok: true as const,
  entryId: "e1",
  categoryName: "Lunch",
  impact: { bucketName: "Living", bucketLeftMinor: 932_000, isSpendBucket: true, perDayMinor: 301_800 },
};

function setup() {
  return render(
    <LiveRegionProvider>
      <LogSpendingLauncher data={data} />
    </LiveRegionProvider>,
  );
}
const open = async () => userEvent.click(screen.getByRole("button", { name: "+ Log spending" }));

beforeEach(() => actions.logSpending.mockReset());

describe("Log spending sheet", () => {
  it("opens as a dialog with Amount focused; Category is grouped by bucket in shelf order", async () => {
    setup();
    await open();
    expect(screen.getByRole("dialog", { name: "Log spending" })).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveFocus();
    const groups = screen.getAllByRole("group").map((g) => g.getAttribute("label"));
    expect(groups).toEqual(["Living", "Fun money", "Tax"]);
    expect(screen.getByLabelText("Date")).toHaveAttribute("max", "2026-10-11");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-11");
  });

  it("shows the live impact line, coral below zero, and defaults Paid from to the bucket's account", async () => {
    setup();
    await open();
    expect(screen.getByTestId("log-impact")).toHaveTextContent("Pick a category");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Lunch");
    expect(screen.getByLabelText("Paid from")).toHaveValue("gcash");
    expect(screen.getByTestId("log-impact")).toHaveTextContent("From Living: ₱9,500.00 left");
    await userEvent.type(screen.getByLabelText("Amount"), "180");
    expect(screen.getByTestId("log-impact")).toHaveTextContent("From Living: ₱9,500.00 left → ₱9,320.00About ₱2,830 a day after this, for 4 days");
    expect(screen.getByTestId("log-impact")).not.toHaveAttribute("data-negative");
    await userEvent.clear(screen.getByLabelText("Amount"));
    await userEvent.type(screen.getByLabelText("Amount"), "10,000");
    expect(screen.getByTestId("log-impact")).toHaveTextContent("→ −₱500.00");
    expect(screen.getByTestId("log-impact")).toHaveAttribute("data-negative", "true");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Taxes");
    expect(screen.getByLabelText("Paid from")).toHaveValue("mari");
    expect(screen.getByTestId("log-impact")).not.toHaveTextContent("a day");
  });

  it("shows each error inline with the SPEC copy, focuses the field and writes nothing", async () => {
    setup();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(screen.getByText("Enter what you spent, above ₱0.")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveFocus();

    await userEvent.type(screen.getByLabelText("Amount"), "99,999,999");
    await userEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(screen.getByText("That amount looks too large. Check the number of zeros.")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Amount"));
    await userEvent.type(screen.getByLabelText("Amount"), "50");
    await userEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(screen.getByText("Pick a category, so it comes out of the right bucket.")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toHaveFocus();
    expect(screen.getByLabelText("Category")).toHaveAttribute("aria-invalid", "true");
    expect(actions.logSpending).not.toHaveBeenCalled();
  });

  it("rejects a future date inline", async () => {
    setup();
    await open();
    await userEvent.type(screen.getByLabelText("Amount"), "50");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Lunch");
    const date = screen.getByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-12");
    await userEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(screen.getByText(/Pick today or an earlier date/)).toBeInTheDocument();
    expect(date).toHaveFocus();
    expect(actions.logSpending).not.toHaveBeenCalled();
  });

  it("Log it: sends the entry, closes, shows the Logged flag, announces, and returns focus to + Log spending", async () => {
    actions.logSpending.mockResolvedValue(OK);
    setup();
    await open();
    await userEvent.type(screen.getByLabelText("Amount"), "180");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Lunch");
    await userEvent.click(screen.getByRole("button", { name: "Log it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(actions.logSpending).toHaveBeenCalledWith({ amount: "180", categoryId: "lunch", note: "", accountId: "gcash", date: "2026-10-11" });
    expect(screen.getByTestId("logged-flag")).toHaveTextContent("Logged ₱180.00 for Lunch. Living has ₱9,320.00 left. Safe to spend: about ₱3,018 a day.");
    expect(screen.getByRole("button", { name: "+ Log spending" })).toHaveFocus();
    await waitFor(() => expect(screen.getByTestId("live-region")).toHaveTextContent("Logged ₱180.00 for Lunch. Living has ₱9,320.00 left."));
  });

  it("uses the note as the label in the flag", async () => {
    actions.logSpending.mockResolvedValue(OK);
    setup();
    await open();
    await userEvent.type(screen.getByLabelText("Amount"), "180");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Lunch");
    await userEvent.type(screen.getByLabelText(/What was it/), "Jollibee");
    await userEvent.click(screen.getByRole("button", { name: "Log it" }));
    await waitFor(() => expect(screen.getByTestId("logged-flag")).toHaveTextContent("Logged ₱180.00 for Jollibee."));
  });

  it("Log and add another: stays open, keeps category and date, clears amount and note, focuses Amount", async () => {
    actions.logSpending.mockResolvedValue(OK);
    setup();
    await open();
    await userEvent.type(screen.getByLabelText("Amount"), "180");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Lunch");
    await userEvent.type(screen.getByLabelText(/What was it/), "Jollibee");
    await userEvent.click(screen.getByRole("button", { name: "Log and add another" }));
    await waitFor(() => expect(screen.getByTestId("logged-flag")).toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toHaveValue("lunch");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-11");
    expect(screen.getByLabelText("Amount")).toHaveValue("");
    expect(screen.getByLabelText(/What was it/)).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveFocus());
  });

  it("a failed write shows the error, keeps the sheet and the typed values, and never shows the flag", async () => {
    actions.logSpending.mockResolvedValue({ ok: false, error: "Couldn't save. Check your connection and try again." });
    setup();
    await open();
    await userEvent.type(screen.getByLabelText("Amount"), "180");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Lunch");
    await userEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue("180");
    expect(screen.queryByTestId("logged-flag")).not.toBeInTheDocument();
  });

  it("server-side field errors land on the field", async () => {
    actions.logSpending.mockResolvedValue({ ok: false, errors: { account: "Pick one of your peso accounts." }, first: "account" });
    setup();
    await open();
    await userEvent.type(screen.getByLabelText("Amount"), "180");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "Lunch");
    await userEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(await screen.findByText("Pick one of your peso accounts.")).toBeInTheDocument();
    expect(screen.getByLabelText("Paid from")).toHaveFocus();
  });

  it("Escape closes the sheet and returns focus to the launcher; reopening starts clean", async () => {
    setup();
    await open();
    await userEvent.type(screen.getByLabelText("Amount"), "77");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Log spending" })).toHaveFocus();
    await open();
    expect(screen.getByLabelText("Amount")).toHaveValue("");
    expect(screen.getByLabelText("Amount")).toHaveFocus();
  });

  it("keeps focus inside while open (Tab wraps)", async () => {
    setup();
    await open();
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 12; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});
