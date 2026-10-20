-- SURDHARA Phase 4: scale + sync hardening. Safe to run more than once.
-- Prerequisite: phase1, phase2 and phase3 SQL files.
-- Run in Supabase Dashboard > SQL Editor as the project owner.

-- 1) Delta sync reads "rows changed since <cursor>". That needs (a) an index and (b) updated_at that
--    is ALWAYS bumped by the database itself, not by whichever client happened to write the row.
CREATE INDEX IF NOT EXISTS songs_status_updated_at_idx ON public.songs (status, updated_at, id);
CREATE INDEX IF NOT EXISTS songs_published_at_id_idx ON public.songs (published_at DESC, id) WHERE status = 'published';

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS songs_touch_updated_at ON public.songs;
CREATE TRIGGER songs_touch_updated_at BEFORE UPDATE ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS artists_touch_updated_at ON public.artists;
CREATE TRIGGER artists_touch_updated_at BEFORE UPDATE ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS catalog_playlists_touch_updated_at ON public.catalog_playlists;
CREATE TRIGGER catalog_playlists_touch_updated_at BEFORE UPDATE ON public.catalog_playlists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Realtime: make sure the catalogue tables publish changes (the app patches single rows in place).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['songs', 'catalog_playlists', 'catalog_playlist_tracks', 'artists'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication unavailable; the app falls back to focus/online sync.';
    END;
  END LOOP;
END $$;

-- 3) Optional, recommended once the catalogue passes ~20k songs: server-side search so the browser
--    does not need every row. (The app does not require this; it is the next scaling step.)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS songs_trgm_title_idx ON public.songs USING gin (title gin_trgm_ops);
