import { NextResponse, type NextRequest } from "next/server";
import { isFirstWebSignIn, trackWith } from "@/lib/analytics";
import { safeNext } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

/** Exchanges the `code` from a confirmation email (or a future OAuth provider) for a session. */
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
  const failed = new URL("/sign-in", origin);
  failed.searchParams.set("error", "link");
  return NextResponse.redirect(failed);
}
