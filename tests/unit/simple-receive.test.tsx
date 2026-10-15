import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { ReceiveMoney, minorToInput } from "@/components/simple-today/ReceiveMoney";
import { dayAmount } from "@/components/simple-today/WeekStrip";
import { buildSimpleTodayStub } from "./simple-fixture";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }));

// Wed Oct 14 2026, 4 days until Sun Oct 18 (the stub's week ends on the 18th), ₱2,276.00 spendable.
const model = buildSimpleTodayStub("2026-10-14");

function setup(receiveMoney = vi.fn().mockResolvedValue({ ok: true as const })) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <LiveRegionProvider>
      <ReceiveMoney open onOpenChange={onOpenChange} model={model} actions={{ receiveMoney }} launcher={() => null} onSaved={onSaved} />
    </LiveRegionProvider>,
  );
  return { receiveMoney, onSaved, onOpenChange };
}
const amountBox = () => screen.getByRole("textbox", { name: "How much did you get?" });
const save = () => screen.getByRole("button", { name: "Save" });

describe("ReceiveMoney", () => {
  it("opens on the amount, with Save off and the reason in plain words", () => {
    setup();
    expect(amountBox()).toHaveFocus();
    expect(save()).toBeDisabled();
    expect(screen.getByTestId("save-reason")).toHaveTextContent("Enter the amount you received.");
  });

  it("shows what the money does to the daily amount before saving", async () => {
    setup();
    await userEvent.type(amountBox(), "2400");
    // (₱2,276.00 + ₱2,400.00) / 4 days = ₱1,169
    expect(screen.getByTestId("receive-live")).toHaveTextContent("₱2,400.00 is yours to spend. Lasts until");
    expect(screen.getByTestId("receive-live")).toHaveTextContent("about ₱1,169 a day");
    expect(save()).toBeEnabled();
  });

  it("keeping some aside lowers what is yours to spend", async () => {
    setup();
    await userEvent.type(amountBox(), "2400");
    await userEvent.type(screen.getByRole("textbox", { name: /Keep some aside/ }), "1000");
    expect(screen.getByTestId("receive-live")).toHaveTextContent("₱1,400.00 is yours to spend");
    expect(screen.getByTestId("receive-live")).toHaveTextContent("about ₱919 a day");
  });

  it("the received-in row holds the remainder as other rows change", async () => {
    setup();
    await userEvent.type(amountBox(), "1500");
    expect(screen.getByTestId("received-in-amount")).toHaveTextContent("₱1,500.00");
    await userEvent.type(screen.getByRole("textbox", { name: "Move to Cash" }), "500");
    expect(screen.getByTestId("received-in-amount")).toHaveTextContent("₱1,000.00");
    expect(save()).toBeEnabled();
  });

  it("refuses a total that is not the amount, and says why", async () => {
    setup();
    await userEvent.type(amountBox(), "1500");
    await userEvent.type(screen.getByRole("textbox", { name: "Move to Cash" }), "1600");
    expect(save()).toBeDisabled();
    expect(screen.getByTestId("save-reason")).toHaveTextContent("add up to more than you received");
    expect(screen.getByTestId("received-in-amount")).toHaveTextContent("—");
  });

  it("'All in' puts everything in one account", async () => {
    setup();
    await userEvent.type(amountBox(), "1500");
    await userEvent.type(screen.getByRole("textbox", { name: "Move to Cash" }), "500");
    await userEvent.click(screen.getByTestId("all-in-acc-cash"));
    expect(screen.getByTestId("received-in")).toHaveValue("acc-cash");
    expect(screen.getByTestId("received-in-amount")).toHaveTextContent("₱1,500.00");
  });

  it("saves exact lines (split over two accounts plus a keep line) and reports the move", async () => {
    const { receiveMoney, onSaved, onOpenChange } = setup();
    await userEvent.type(amountBox(), "2400");
    await userEvent.type(screen.getByRole("textbox", { name: "Move to Cash" }), "500");
    await userEvent.type(screen.getByRole("textbox", { name: /Keep some aside/ }), "1000");
    await userEvent.click(save());
    await waitFor(() => expect(receiveMoney).toHaveBeenCalledTimes(1));
    const arg = receiveMoney.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ amountMinor: 240_000, receivedInId: "acc-mari", sourceId: "src-work", on: "2026-10-14" });
    expect(arg.lines).toEqual([
      { bucketId: "bucket-living", destAccountId: "acc-mari", amountMinor: 90_000 },
      { bucketId: "bucket-emergency", destAccountId: "acc-mari", amountMinor: 100_000 },
      { bucketId: "bucket-living", destAccountId: "acc-cash", amountMinor: 50_000 },
    ]);
    expect(arg.lines.reduce((s: number, l: { amountMinor: number }) => s + l.amountMinor, 0)).toBe(240_000);
    expect(onSaved).toHaveBeenCalledWith([{ from: "acc-mari", fromName: "MariBank", to: "acc-cash", toName: "Cash", amountMinor: 50_000 }]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps every field when the save fails", async () => {
    const { onOpenChange } = setup(vi.fn().mockResolvedValue({ ok: false as const, error: "Couldn't save. Nothing was changed." }));
    await userEvent.type(amountBox(), "1500");
    await userEvent.type(screen.getByRole("textbox", { name: "Move to Cash" }), "500");
    await userEvent.click(save());
    expect(await screen.findByTestId("receive-error")).toHaveTextContent("Nothing was changed");
    expect(amountBox()).toHaveValue("1500");
    expect(screen.getByRole("textbox", { name: "Move to Cash" })).toHaveValue("500");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("helpers", () => {
  it("minorToInput never uses floats", () => {
    expect(minorToInput(50_000)).toBe("500");
    expect(minorToInput(50_050)).toBe("500.50");
    expect(minorToInput(5)).toBe("0.05");
  });
  it("dayAmount is short and floors", () => {
    expect(dayAmount(56_900)).toBe("₱569");
    expect(dayAmount(99)).toBe("₱0");
    expect(dayAmount(1_234_500)).toBe("₱12k");
    expect(dayAmount(-8_697)).toBe("−₱87");
  });
});
