import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountView, AccountsData } from "@/lib/data/accounts";

const actions = vi.hoisted(() => ({
  addAccountAction: vi.fn(),
  archiveAccountAction: vi.fn(),
  renameAccountAction: vi.fn(),
  restoreAccountAction: vi.fn(),
  retypeAccountAction: vi.fn(),
}));
vi.mock("@/lib/actions/accounts", () => actions);

import { AccountsPanel } from "@/components/plans/accounts/AccountsPanel";

const acct = (over: Partial<AccountView>): AccountView => ({
  id: "a1",
  name: "MariBank",
  type: "bank",
  currency: "PHP",
  shouldHoldMinor: 1_024_000,
  balanceMinor: 1_024_000,
  gap: { kind: "even", amountMinor: 0 },
  retainedMinor: null,
  caption: "in the account",
  bucketsLine: "₱10,240.00 by your buckets",
  buckets: [{ id: "b1", name: "Emergency fund", hue: "emergency" }],
  sources: [{ id: "s1", name: "Work", hue: null }],
  inUseReason: "Emergency fund is kept here",
  ...over,
});

const data = (over: Partial<AccountsData> = {}): AccountsData => ({
  active: [
    acct({}),
    acct({ id: "a2", name: "Old wallet", type: "eWallet", shouldHoldMinor: 0, balanceMinor: 250_000, gap: { kind: "unbucketed", amountMinor: 250_000 }, bucketsLine: "₱0.00 by your buckets", buckets: [], sources: [], inUseReason: null }),
    acct({ id: "a3", name: "AUD account", currency: "AUD", shouldHoldMinor: null, balanceMinor: null, gap: null, bucketsLine: null, retainedMinor: 1_701_000, caption: "kept in AUD after transfers", buckets: [], sources: [], inUseReason: "it holds money" }),
  ],
  archived: [{ id: "a9", name: "Closed card", currency: "PHP" }],
  ...over,
});

beforeEach(() => {
  for (const f of Object.values(actions)) f.mockReset();
});

describe("AccountsPanel", () => {
  it("shows buckets and sources as chips, exact amounts, and the first reason when in use", () => {
    render(<AccountsPanel data={data()} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Emergency fund")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Work lands here")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("holds")).toHaveTextContent("₱10,240.00");
    expect(within(rows[0]).getByText("Emergency fund is kept here")).toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button", { name: /Archive/ })).not.toBeInTheDocument();
    expect(within(rows[2]).getByTestId("holds")).toHaveTextContent("A$17,010.00");
    expect(within(rows[2]).getByText("it holds money")).toBeInTheDocument();
  });

  it("archives a free account; a refusal from the server is shown at the control", async () => {
    actions.archiveAccountAction.mockResolvedValueOnce({ ok: false, error: "In use: it holds money." });
    render(<AccountsPanel data={data()} />);
    await userEvent.click(screen.getByRole("button", { name: "Archive Old wallet" }));
    expect(actions.archiveAccountAction).toHaveBeenCalledWith({ id: "a2" });
    expect(await screen.findByText("In use: it holds money.")).toBeInTheDocument();
    actions.archiveAccountAction.mockResolvedValueOnce({ ok: true });
    await userEvent.click(screen.getByRole("button", { name: "Archive Old wallet" }));
    expect(actions.archiveAccountAction).toHaveBeenCalledTimes(2);
  });

  it("renames on blur, and restores the old name with a message when the save fails", async () => {
    actions.renameAccountAction.mockResolvedValueOnce({ ok: false, error: "Couldn't save. Check your connection and try again." });
    render(<AccountsPanel data={data()} />);
    const input = screen.getByRole("textbox", { name: "Account name for Old wallet" });
    await userEvent.clear(input);
    await userEvent.type(input, "Savings jar");
    await userEvent.tab();
    expect(actions.renameAccountAction).toHaveBeenCalledWith({ id: "a2", name: "Savings jar" });
    expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument();
    expect(input).toHaveValue("Old wallet");
  });

  it("does not call the server when the name did not change; Escape reverts", async () => {
    render(<AccountsPanel data={data()} />);
    const input = screen.getByRole("textbox", { name: "Account name for Old wallet" });
    await userEvent.click(input);
    await userEvent.tab();
    await userEvent.type(input, "x{Escape}");
    expect(input).toHaveValue("Old wallet");
    expect(actions.renameAccountAction).not.toHaveBeenCalled();
  });

  it("changes the type and puts it back if the save fails", async () => {
    actions.retypeAccountAction.mockResolvedValueOnce({ ok: false, error: "Couldn't save." });
    render(<AccountsPanel data={data()} />);
    const select = screen.getByRole("combobox", { name: "Type of Old wallet" });
    await userEvent.selectOptions(select, "savings");
    expect(actions.retypeAccountAction).toHaveBeenCalledWith({ id: "a2", type: "savings" });
    expect(await screen.findByText("Couldn't save.")).toBeInTheDocument();
    expect(select).toHaveValue("eWallet");
  });

  it("Add account: shows the server's duplicate-name error inline and keeps the form open", async () => {
    actions.addAccountAction.mockResolvedValueOnce({ ok: false, error: "You already have an account called GCash. Pick a different name." });
    render(<AccountsPanel data={data()} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add account" }));
    await userEvent.type(screen.getByLabelText("Name"), "GCash");
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "AUD");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(actions.addAccountAction).toHaveBeenCalledWith({ name: "GCash", type: "bank", currency: "AUD" });
    expect(await screen.findByText(/already have an account called GCash/)).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("Add account: closes the form on success and returns focus to the add button", async () => {
    actions.addAccountAction.mockResolvedValueOnce({ ok: true, value: { id: "new" } });
    render(<AccountsPanel data={data()} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add account" }));
    await userEvent.type(screen.getByLabelText("Name"), "BPI Savings");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    const toggle = await screen.findByRole("button", { name: "+ Add account" });
    await vi.waitFor(() => expect(toggle).toHaveFocus());
  });

  it("lists archived accounts with Restore", async () => {
    actions.restoreAccountAction.mockResolvedValueOnce({ ok: true });
    render(<AccountsPanel data={data()} />);
    const archived = screen.getByTestId("archived-accounts");
    expect(archived).toHaveTextContent("Closed card");
    await userEvent.click(within(archived).getByRole("button", { name: "Restore Closed card" }));
    expect(actions.restoreAccountAction).toHaveBeenCalledWith({ id: "a9" });
  });

  it("with no accounts: explains how to add the first one and still offers the form", () => {
    render(<AccountsPanel data={{ active: [], archived: [] }} />);
    expect(screen.getByRole("heading", { name: "No accounts yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add account" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("₱");
  });
});
