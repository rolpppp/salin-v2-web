import { NextResponse, type NextRequest } from "next/server";
import { isFirstWebSignIn, trackWith } from "@/lib/analytics";
import { safeNext } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the `code` from a confirmation or password-reset email (or a future OAuth provider) for a session.
 * A recovery exchange is a real signed-in session, so it records `web_signed_in` like any other.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const firstTime = await isFirstWebSignIn(supabase);
        await trackWith(supabase, "web_signed_in", { first_time: firstTime });
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }
  // A reset link that didn't work goes back to where a new one can be asked for, not to sign-in's generic error.
  const failed = new URL(new URL(next, origin).pathname === "/reset-password" ? "/forgot-password" : "/sign-in", origin);
  failed.searchParams.set("error", "link");
  return NextResponse.redirect(failed);
}
