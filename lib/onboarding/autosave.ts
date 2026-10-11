import type { OnboardingDraft } from "./draft";

export interface Autosaver {
  /** Queue the latest draft; saved after the debounce. Cheap to call on every keystroke. */
  schedule(draft: OnboardingDraft): void;
  /** Save now and resolve once nothing is pending or in flight. Never rejects. */
  flush(): Promise<void>;
  /** Whether the last attempt succeeded (true before any attempt). */
  lastOk(): boolean;
  dispose(): void;
}

export interface AutosaverOptions {
  save: (draft: OnboardingDraft) => Promise<{ ok: boolean }>;
  delayMs?: number;
  /** JSON of what's already stored, so an unchanged draft isn't written. */
  baseline?: string;
  /** Called after each attempt: true on success, false on failure. Success should show nothing. */
  onStatus?: (ok: boolean) => void;
}

/**
 * Debounced, last-write-wins autosave. Saves run one at a time in order, so a slow earlier write can never land
 * after a newer one. Typing is never blocked: `schedule` is synchronous and the network call is fire-and-forget.
 * A failed save isn't retried on a timer; the next change (or `flush`) tries again with the newest draft.
 */
export function createAutosaver(opts: AutosaverOptions): Autosaver {
  const delay = opts.delayMs ?? 700;
  let stored = opts.baseline ?? null;
  let pending: { draft: OnboardingDraft; json: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;
  let ok = true;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  async function drain(): Promise<void> {
    while (pending && !disposed) {
      const job = pending;
      pending = null;
      if (job.json === stored) continue;
      try {
        const r = await opts.save(job.draft);
        if (r.ok) stored = job.json;
        ok = r.ok;
        opts.onStatus?.(r.ok);
      } catch {
        ok = false;
        opts.onStatus?.(false);
      }
    }
  }

  function start(): Promise<void> {
    if (!running) {
      running = drain().finally(() => {
        running = null;
      });
    }
    return running;
  }

  return {
    schedule(draft) {
      if (disposed) return;
      const json = JSON.stringify(draft);
      if (json === stored && !running) {
        pending = null;
        clear();
        return;
      }
      pending = { draft, json };
      clear();
      timer = setTimeout(() => {
        timer = null;
        void start();
      }, delay);
    },
    async flush() {
      clear();
      while (pending || running) await start();
    },
    lastOk: () => ok,
    dispose() {
      disposed = true;
      clear();
    },
  };
}
