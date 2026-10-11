import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SegmentedControl } from "@/components/segmented-control/SegmentedControl";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
] as const;

function Harness() {
  const [v, setV] = useState<"a" | "b" | "c">("a");
  return <SegmentedControl label="Letters" options={options} value={v} onValueChange={setV} />;
}

describe("SegmentedControl", () => {
  it("has one tab stop on the checked radio", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Letters" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves and selects with arrow keys, wrapping at the ends", async () => {
    render(<Harness />);
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Gamma" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "Gamma" })).toBeChecked();
  });
});
