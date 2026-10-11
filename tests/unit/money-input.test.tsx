import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MoneyInput, type MoneyParseResult } from "@/components/money-input/MoneyInput";

const parse = (raw: string): MoneyParseResult =>
  /^\d+(\.\d{1,2})?$/.test(raw) ? { ok: true, minor: 0 } : { ok: false, error: "Enter an amount like 1,500.00." };

describe("MoneyInput", () => {
  it("validates with the injected parser on blur", async () => {
    render(<MoneyInput label="Amount received" parse={parse} />);
    const input = screen.getByLabelText("Amount received");
    await userEvent.type(input, "abc");
    await userEvent.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount like 1,500.00.");
    await userEvent.clear(input);
    await userEvent.type(input, "1500");
    await userEvent.tab();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });
});
