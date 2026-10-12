import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRefreshScheduler, LIVE_DEBOUNCE_MS } from "@/lib/live/refresh-scheduler";

describe("createRefreshScheduler", () => {
  let hidden = false;
  const refresh = vi.fn();
  const make = () => createRefreshScheduler({ refresh, isHidden: () => hidden });
  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    refresh.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("refreshes once for a burst, after the quiet period, with every source", () => {
    const s = make();
    for (let i = 0; i < 500; i++) {
      s.notify("ledger_entries");
      vi.advanceTimersByTime(10); // 5 s of continuous events: the debounce keeps sliding
    }
    expect(refresh).not.toHaveBeenCalled();
    s.notify("accounts");
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect([...refresh.mock.calls[0][0]].sort()).toEqual(["accounts", "ledger_entries"]);
    vi.advanceTimersByTime(5_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("starts a new burst after the first refresh", () => {
    const s = make();
    s.notify("ledger_entries");
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS);
    s.notify("categories");
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect([...refresh.mock.calls[1][0]]).toEqual(["categories"]);
  });

  it("holds while hidden and refreshes once when shown", () => {
    const s = make();
    hidden = true;
    s.notify("ledger_entries");
    s.notify("ledger_entries");
    vi.advanceTimersByTime(10_000);
    expect(refresh).not.toHaveBeenCalled();
    hidden = false;
    s.visibilityChanged();
    s.visibilityChanged();
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing on becoming visible when no events arrived", () => {
    const s = make();
    s.visibilityChanged();
    vi.advanceTimersByTime(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("hidden again before the timer fires: stays pending", () => {
    const s = make();
    s.notify("accounts");
    hidden = true;
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS);
    expect(refresh).not.toHaveBeenCalled();
    hidden = false;
    s.visibilityChanged();
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a reconnect refreshes once, coalesced with events", () => {
    const s = make();
    s.reconnected();
    s.notify("transfers");
    vi.advanceTimersByTime(LIVE_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("dispose cancels a pending refresh and ignores later events", () => {
    const s = make();
    s.notify("accounts");
    s.dispose();
    s.notify("accounts");
    vi.advanceTimersByTime(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
