import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and route handlers.
 * Returns null when Supabase env vars are not set.
 */
export async function createClient(): Promise<SupabaseClient<Database> | null> {
  // Read cookies first so every caller is dynamic, even when env vars are missing at build time.
  const cookieStore = await cookies();
  const env = getSupabaseEnv();
  if (!env) return null;
  return createServerClient<Database>(env.url, env.anonKey, {
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
}
