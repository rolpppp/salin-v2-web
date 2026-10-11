import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LiveRegionProvider, useAnnounce } from "@/components/live-region/LiveRegion";

function Trigger({ message }: { message: string }) {
  const announce = useAnnounce();
  return <button onClick={() => announce(message)}>Go</button>;
}

describe("LiveRegion", () => {
  it("renders one polite region and announces messages", async () => {
    render(
      <LiveRegionProvider>
        <Trigger message="MariBank archived" />
      </LiveRegionProvider>,
    );
    const region = screen.getByTestId("live-region");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    await waitFor(() => expect(region).toHaveTextContent("MariBank archived"));
  });

  it("does nothing outside a provider", async () => {
    render(<Trigger message="x" />);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(0);
  });
});
