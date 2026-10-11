"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

type Announce = (message: string) => void;

const noop: Announce = () => {};
const LiveRegionContext = createContext<Announce>(noop);

/** Mount once near the root. Renders the single polite aria-live region for the whole app. */
export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const frame = useRef<number | null>(null);

  const announce = useCallback<Announce>((message) => {
    // Clear first so repeating the same message is announced again.
    setText("");
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setText(message));
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const value = useMemo(() => announce, [announce]);

  return (
    <LiveRegionContext.Provider value={value}>
      {children}
      <div id="live" className="sr" aria-live="polite" aria-atomic="true" data-testid="live-region">
        {text}
      </div>
    </LiveRegionContext.Provider>
  );
}

/** Returns announce(message). Safe to call outside a provider (does nothing). */
export function useAnnounce(): Announce {
  return useContext(LiveRegionContext);
}
