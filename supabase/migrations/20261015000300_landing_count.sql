-- Landing page social proof (ticket 30): how many people have signed up since a given moment. The landing page shows
-- 53 (people on the phone app who haven't synced online yet) plus this count, so it grows as new people join.
-- Returns one integer and nothing else: no ids, emails or dates leave the database. Readable signed out (anon).
create or replace function public.landing_signup_count(p_since timestamptz)
returns integer language sql stable security definer set search_path = public, auth
as $$
  select count(*)::int from auth.users u where u.created_at >= p_since;
$$;

revoke all on function public.landing_signup_count(timestamptz) from public;
grant execute on function public.landing_signup_count(timestamptz) to anon, authenticated;
