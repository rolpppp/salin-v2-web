import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver } from "./autosave";
import { emptyDraft, type OnboardingDraft } from "./draft";

const d = (firstName: string): OnboardingDraft => ({ ...emptyDraft(), firstName });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("autosave", () => {
  it("debounces: many edits become one save of the newest draft", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const a = createAutosaver({ save, delayMs: 500 });
    a.schedule(d("M"));
    a.schedule(d("Ma"));
    a.schedule(d("Mar"));
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(d("Mar"));
  });

  it("doesn't write what's already stored (baseline), and reports nothing on success", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    const onStatus = vi.fn();
    const a = createAutosaver({ save, baseline: JSON.stringify(emptyDraft()), onStatus });
    a.schedule(emptyDraft());
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    a.schedule(d("Rolf"));
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(true);
  });

  it("last write wins: saves never overlap, and an edit made during a slow save is saved right after it", async () => {
    const order: string[] = [];
    let release!: () => void;
    const save = vi.fn(async (draft: OnboardingDraft) => {
      order.push(`start ${draft.firstName}`);
      if (draft.firstName === "A") await new Promise<void>((r) => (release = r));
      order.push(`end ${draft.firstName}`);
      return { ok: true };
    });
    const a = createAutosaver({ save, delayMs: 100 });
    a.schedule(d("A"));
    await vi.advanceTimersByTimeAsync(100);
    a.schedule(d("B"));
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(["start A"]);
    release();
    await a.flush();
    expect(order).toEqual(["start A", "end A", "start B", "end B"]);
  });

  it("a failed save is reported, kept as unsaved, and retried by the next change or flush", async () => {
    const save = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    const onStatus = vi.fn();
    const a = createAutosaver({ save, onStatus });
    a.schedule(d("X"));
    await a.flush();
    expect(onStatus).toHaveBeenLastCalledWith(false);
    expect(a.lastOk()).toBe(false);
    a.schedule(d("X"));
    await a.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenLastCalledWith(true);
    expect(a.lastOk()).toBe(true);
  });

  it("a thrown save counts as a failure and never rejects flush", async () => {
    const save = vi.fn().mockRejectedValue(new Error("offline"));
    const onStatus = vi.fn();
    const a = createAutosaver({ save, onStatus });
    a.schedule(d("X"));
    await expect(a.flush()).resolves.toBeUndefined();
    expect(onStatus).toHaveBeenCalledWith(false);
  });
});
