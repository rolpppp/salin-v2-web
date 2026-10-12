-- =============================================================================
-- D-16: the shared server-time `updatedAt` trigger FUNCTION. Safe for live: it only
-- exists here; web tables attach it in later migrations.
-- The triggers on the 12 mobile-synced tables are held back in
-- supabase/held/d16_synced_updated_at_triggers.sql until the mobile pull fix ships
-- (mobile's pull compares "updatedAt" against the phone clock).
-- =============================================================================

-- Shared by every new web table (and, once D-16 ships, the 12 synced tables). Ignores any client value.
create or replace function public.set_updated_at_ms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new."updatedAt" := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end;
$$;
