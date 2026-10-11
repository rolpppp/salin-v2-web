export type ThemeChoice = "light" | "dark";

export const THEME_STORAGE_KEY = "salin-theme";

/**
 * Runs in <head> before first paint. Applies a saved choice only; with no saved choice the
 * CSS follows prefers-color-scheme on its own. Storage access is wrapped: it can throw.
 */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export function effectiveTheme(): ThemeChoice {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "light" || forced === "dark") return forced;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: ThemeChoice): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage blocked: the choice still applies for this page view */
  }
}
