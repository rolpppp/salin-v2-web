import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { LiveRegionProvider } from "@/components/live-region/LiveRegion";
import { TodayView } from "@/components/today/TodayView";
import { buildTodayView } from "@/lib/data/today-model";
import { g9 } from "@/lib/data/today-testkit";
import { formatPeso } from "@/lib/money";
import { useCountUp } from "@/lib/motion/useCountUp";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/actions/covers", () => ({ coverFromBuffer: vi.fn() }));

function mockReduced(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
}

function Amount({ active, from, to }: { active: boolean; from: number; to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = formatPeso(to);
  useCountUp(ref, { active, from, to, format: formatPeso, finalText, durationMs: 100 });
  return (
    <span ref={ref} data-testid="amt">
      {finalText}
    </span>
  );
}

let now = 0;
let queue: FrameRequestCallback[] = [];
beforeEach(() => {
  replace.mockReset();
  now = 0;
  queue = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (queue.push(cb), queue.length));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  mockReduced(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const frame = (t: number) =>
  act(() => {
    now = t;
    const cbs = queue;
    queue = [];
    cbs.forEach((cb) => cb(t));
  });

describe("useCountUp", () => {
  it("renders the final value before any frame runs, then ends on it", () => {
    render(<Amount active from={0} to={1_732_900} />);
    const el = screen.getByTestId("amt");
    // mid-animation the DOM shows a frame, hidden from assistive tech
    expect(el).toHaveAttribute("aria-hidden", "true");
    frame(50);
    expect(el.textContent).not.toBe("₱17,329.00");
    frame(200);
    expect(el).toHaveTextContent("₱17,329.00");
    expect(el).not.toHaveAttribute("aria-hidden");
  });

  it("does nothing when not active (final value, no aria-hidden, no frames)", () => {
    render(<Amount active={false} from={0} to={1_732_900} />);
    expect(screen.getByTestId("amt")).toHaveTextContent("₱17,329.00");
    expect(screen.getByTestId("amt")).not.toHaveAttribute("aria-hidden");
    expect(queue).toHaveLength(0);
  });

  it("is off under reduced motion", () => {
    mockReduced(true);
    render(<Amount active from={0} to={1_732_900} />);
    expect(screen.getByTestId("amt")).toHaveTextContent("₱17,329.00");
    expect(queue).toHaveLength(0);
  });
});

describe("Today grow", () => {
  const view = () => buildTodayView(g9());
  const renderToday = (grow: "confirm" | "onboarding" | null) =>
    render(
      <LiveRegionProvider>
        <TodayView view={view()} logSlot={null} grow={grow} />
      </LiveRegionProvider>,
    );

  it("with no param nothing plays and nothing is stripped", () => {
    const { container } = renderToday(null);
    expect(container.querySelector("[data-grow]")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("?grow=confirm plays once and strips the param so a refresh doesn't replay", () => {
    const { container } = renderToday("confirm");
    expect(container.querySelector("[data-grow='confirm']")).not.toBeNull();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/today", { scroll: false });
  });

  it("keeps the real numbers in the DOM while it plays, and announces the change", () => {
    renderToday("onboarding");
    expect(screen.getByTestId("shelf-total")).toHaveTextContent(formatPeso(view().shelf?.totalMinor ?? 0));
    frame(1); // the live region writes on the next animation frame
    expect(screen.getByTestId("live-region")).toHaveTextContent("Your plan is set.");
  });

  it("clears the flag after the animations are over", () => {
    vi.useFakeTimers();
    const { container } = renderToday("confirm");
    expect(container.querySelector("[data-grow]")).not.toBeNull();
    act(() => vi.advanceTimersByTime(3_000));
    expect(container.querySelector("[data-grow]")).toBeNull();
    vi.useRealTimers();
  });
});
