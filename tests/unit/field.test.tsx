import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, Input } from "@/components/field/Field";

describe("Field", () => {
  it("links label, hint and error to the control and flags invalid", () => {
    render(
      <Field label="Source" hint="Where it came from" error="Add a source name.">
        {(c) => <Input {...c} />}
      </Field>,
    );
    const input = screen.getByLabelText("Source");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Add a source name.");
    const described = input.getAttribute("aria-describedby") ?? "";
    expect(described.split(" ")).toHaveLength(2);
  });

  it("is not invalid without an error", () => {
    render(<Field label="Source">{(c) => <Input {...c} />}</Field>);
    expect(screen.getByLabelText("Source")).not.toHaveAttribute("aria-invalid");
  });
});
