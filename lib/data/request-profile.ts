import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, type Profile } from "./today";

/** The signed-in user's profile, read once per request however many components ask (React `cache`). Throws on a read error. */
export const getRequestProfile = cache(async (userId: string): Promise<Profile | null> => {
  const client = await createClient();
  return client ? getProfile(client, userId) : null;
});
