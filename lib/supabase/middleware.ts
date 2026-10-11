import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRedirect, isOnboardingEnabled } from "@/lib/auth/redirects";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "./env";

/**
 * Refreshes the Supabase session cookie, then applies route protection:
 * signed-out -> /sign-in?next=..., signed-in on /sign-in -> /today, and (behind
 * NEXT_PUBLIC_ONBOARDING_ENABLED, decision P-6) not-onboarded -> /welcome.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const env = getSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  let userId: string | null = null;
  try {
    // Validates the token and refreshes it if expired. Do not put code between client creation and this call.
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims?.sub ?? null;
  } catch {
    // Supabase unreachable: treat as signed out (the layout re-checks) rather than failing the page.
  }

  const { pathname, search } = request.nextUrl;
  const onboardingEnabled = isOnboardingEnabled();
  let onboarded = true;
  if (userId && onboardingEnabled && !pathname.startsWith("/welcome")) {
    try {
      const { data } = await supabase.from("user_profiles").select("onboardedAt").eq("user_id", userId).maybeSingle();
      onboarded = data?.onboardedAt != null;
    } catch {
      onboarded = true; // never lock someone out because the profile lookup failed
    }
  }

  const target = decideRedirect({ pathname, search, signedIn: userId !== null, onboarded, onboardingEnabled });
  if (!target) return response;

  const url = request.nextUrl.clone();
  const [path, query = ""] = target.split("?");
  url.pathname = path;
  url.search = query ? `?${query}` : "";
  const redirect = NextResponse.redirect(url);
  // Carry any refreshed session cookies onto the redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
