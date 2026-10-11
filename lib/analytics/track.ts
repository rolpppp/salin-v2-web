import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type { EventMap, EventName } from "./events";

type Client = SupabaseClient<Database>;

/**
 * Inserts one row into `public.events` as the signed-in user (the column default fills `user_id`).
 * Never throws and never blocks the user action: failures are logged and swallowed.
 */
export async function trackWith<E extends EventName>(client: Client | null, event: E, props: EventMap[E]): Promise<void> {
  try {
    if (!client) return;
    const { error } = await client.from("events").insert({ name: event, props: props as unknown as Json, occurredAt: Date.now() });
    if (error) console.error(`[analytics] ${event} not recorded: ${error.message}`);
  } catch (err) {
    console.error(`[analytics] ${event} not recorded`, err);
  }
}

/** Server-side helper: `await track("web_signed_in", { first_time: true })`. */
export async function track<E extends EventName>(event: E, props: EventMap[E]): Promise<void> {
  try {
    await trackWith(await createClient(), event, props);
  } catch (err) {
    console.error(`[analytics] ${event} not recorded`, err);
  }
}

/** True when this user has never had a `web_signed_in` event. Errors count as "not first". */
export async function isFirstWebSignIn(client: Client): Promise<boolean> {
  try {
    const { count, error } = await client.from("events").select("id", { count: "exact", head: true }).eq("name", "web_signed_in");
    if (error) return false;
    return count === 0;
  } catch {
    return false;
  }
}
