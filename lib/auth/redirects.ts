import { safeNext } from "./schemas";

export type RouteInput = {
  pathname: string;
  search?: string;
  signedIn: boolean;
  /** `user_profiles.onboardedAt` is set. Only read when onboarding is enabled. */
  onboarded: boolean;
  onboardingEnabled: boolean;
};

const AUTH_PAGES = ["/sign-in", "/sign-up"];

/**
 * Reachable signed in or out, never bounced. `/forgot-password` works for anyone; `/reset-password` needs the
 * recovery session, but the page itself shows the "expired link" state when there is none, so the proxy must not
 * send signed-out visitors to sign-in, and must not send not-yet-onboarded users to /welcome.
 */
const RECOVERY_PAGES = ["/forgot-password", "/reset-password"];

const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Where a request should be sent instead, or null to let it through. Pure so it can be unit tested. */
export function decideRedirect(i: RouteInput): string | null {
  const { pathname, signedIn } = i;
  // OAuth / email-link code exchange must always run.
  if (isUnder(pathname, "/auth")) return null;

  if (RECOVERY_PAGES.some((p) => isUnder(pathname, p))) return null;

  if (AUTH_PAGES.some((p) => isUnder(pathname, p))) {
    if (!signedIn) return null;
    const next = new URLSearchParams(i.search ?? "").get("next");
    return safeNext(next);
  }

  if (!signedIn) {
    // The landing page is public. (Signed-in visitors to "/" are sent to Today by the page itself.)
    if (pathname === "/") return null;
    const target = `${pathname}${i.search ?? ""}`;
    return `/sign-in?next=${encodeURIComponent(target)}`;
  }

  // P-6: behind NEXT_PUBLIC_ONBOARDING_ENABLED until onboarding ships.
  if (i.onboardingEnabled && !i.onboarded && !isUnder(pathname, "/welcome")) return "/welcome";
  return null;
}

export const isOnboardingEnabled = () => process.env.NEXT_PUBLIC_ONBOARDING_ENABLED === "true";
