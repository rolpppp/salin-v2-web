/** Bucket hues: the nine built-in ones, plus the custom palette c1..c8 (tokens `--b-c1`..`--b-c8`, aliased `--hue-c1`..). */
export const BUILTIN_HUES = ["living", "fun", "emergency", "invest", "sinking", "tax", "buffer", "rent", "dost"] as const;
export const CUSTOM_HUES = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
export type CustomHue = (typeof CUSTOM_HUES)[number];

const KNOWN = new Set<string>([...BUILTIN_HUES, ...CUSTOM_HUES]);

export const isCustomHue = (hue: string | null | undefined): hue is CustomHue => !!hue && (CUSTOM_HUES as readonly string[]).includes(hue);
/** A built-in bucket is identified by its hue; its colour can't be changed. */
export const isBuiltinHue = (hue: string | null | undefined): boolean => !!hue && (BUILTIN_HUES as readonly string[]).includes(hue);
export const isKnownHue = (hue: string | null | undefined): hue is string => !!hue && KNOWN.has(hue);

/** CSS colour for a bucket hue. Unknown or missing hues fall back to `fallback` (default: the neutral buffer colour). */
export function hueVar(hue: string | null | undefined, fallback = "var(--b-buffer)"): string {
  return isKnownHue(hue) ? `var(--b-${hue})` : fallback;
}

/** Spoken names for the swatches, so colour is never the only cue. */
export const HUE_LABELS: Record<CustomHue, string> = {
  c1: "Terracotta",
  c2: "Gold",
  c3: "Green",
  c4: "Teal",
  c5: "Blue",
  c6: "Indigo",
  c7: "Magenta",
  c8: "Brown",
};
