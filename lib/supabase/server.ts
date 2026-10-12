import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "./env";
import { traceFetch } from "./trace";

/**
 * Supabase client for Server Components, Server Actions and route handlers.
 * Returns null when Supabase env vars are not set. Cached per render (React `cache`), so the layout, the page and
 * every loader share one client and one session read instead of building their own.
 */
export const createClient = cache(async (): Promise<SupabaseClient<Database> | null> => {
  // Read cookies first so every caller is dynamic, even when env vars are missing at build time.
  const cookieStore = await cookies();
  const env = getSupabaseEnv();
  if (!env) return null;
  return createServerClient<Database>(env.url, env.anonKey, {
    global: { fetch: traceFetch("rsc") },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there. Middleware refreshes the session.
        }
      },
    },
  });
});
