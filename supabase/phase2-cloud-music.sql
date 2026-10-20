-- SURDHARA Phase 2: shared public music catalogue and cloud audio storage.
-- Prerequisite: run supabase/phase1-auth.sql first.
-- Run this file in Supabase Dashboard > SQL Editor as the project owner.

CREATE TABLE IF NOT EXISTS public.songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('youtube', 'local')),
  youtube_id text UNIQUE,
  source_url text,
  title text NOT NULL,
  artist text NOT NULL DEFAULT '',
  artist_names text[] NOT NULL DEFAULT '{}',
  original_singer text NOT NULL DEFAULT '',
  original_singer_names text[] NOT NULL DEFAULT '{}',
  album text,
  movie text,
  release_date date,
  year integer CHECK (year IS NULL OR year BETWEEN 1800 AND 2200),
  language text NOT NULL DEFAULT 'Unknown',
  genre text NOT NULL DEFAULT 'Unclassified',
  mood text NOT NULL DEFAULT 'all',
  lyricist text,
  composer text,
  music_director text,
  producer text,
  music_label text,
  tags text[] NOT NULL DEFAULT '{}',
  cover_url text,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  audio_path text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  extra_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS songs_status_published_at_idx ON public.songs (status, published_at DESC);
CREATE INDEX IF NOT EXISTS songs_artist_names_gin_idx ON public.songs USING gin (artist_names);
CREATE INDEX IF NOT EXISTS songs_tags_gin_idx ON public.songs USING gin (tags);
CREATE INDEX IF NOT EXISTS songs_title_search_idx ON public.songs USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(artist, '') || ' ' || coalesce(album, '') || ' ' || coalesce(movie, '')));

CREATE TABLE IF NOT EXISTS public.catalog_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  source_type text NOT NULL CHECK (source_type IN ('youtube', 'local_batch')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.catalog_playlist_tracks (
  playlist_id uuid NOT NULL REFERENCES public.catalog_playlists(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, song_id)
);

CREATE INDEX IF NOT EXISTS catalog_playlist_tracks_position_idx ON public.catalog_playlist_tracks (playlist_id, position);

-- Future-ready artist catalogue for verified portraits and editable singer credits.
CREATE TABLE IF NOT EXISTS public.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  photo_url text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.songs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.songs TO authenticated;
GRANT SELECT ON public.catalog_playlists TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.catalog_playlists TO authenticated;
GRANT SELECT ON public.catalog_playlist_tracks TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.catalog_playlist_tracks TO authenticated;
GRANT SELECT ON public.artists TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.artists TO authenticated;

-- has_role is SECURITY DEFINER and only returns a boolean for the signed-in UID.
-- Granting EXECUTE to anon is safe: auth.uid() is null for anon and returns false.
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read published songs; admins can read all" ON public.songs;
CREATE POLICY "Public can read published songs; admins can read all"
  ON public.songs FOR SELECT TO anon, authenticated
  USING (status = 'published' OR (auth.uid() IS NOT NULL AND public.has_role('admin')));
DROP POLICY IF EXISTS "Admins can insert songs" ON public.songs;
CREATE POLICY "Admins can insert songs" ON public.songs FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin') AND created_by = auth.uid());
DROP POLICY IF EXISTS "Admins can update songs" ON public.songs;
CREATE POLICY "Admins can update songs" ON public.songs FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
DROP POLICY IF EXISTS "Admins can delete songs" ON public.songs;
CREATE POLICY "Admins can delete songs" ON public.songs FOR DELETE TO authenticated
  USING (public.has_role('admin'));

DROP POLICY IF EXISTS "Public can read published catalogue playlists; admins can read all" ON public.catalog_playlists;
CREATE POLICY "Public can read published catalogue playlists; admins can read all"
  ON public.catalog_playlists FOR SELECT TO anon, authenticated
  USING (status = 'published' OR (auth.uid() IS NOT NULL AND public.has_role('admin')));
DROP POLICY IF EXISTS "Admins can insert catalogue playlists" ON public.catalog_playlists;
CREATE POLICY "Admins can insert catalogue playlists" ON public.catalog_playlists FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin') AND created_by = auth.uid());
DROP POLICY IF EXISTS "Admins can update catalogue playlists" ON public.catalog_playlists;
CREATE POLICY "Admins can update catalogue playlists" ON public.catalog_playlists FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
DROP POLICY IF EXISTS "Admins can delete catalogue playlists" ON public.catalog_playlists;
CREATE POLICY "Admins can delete catalogue playlists" ON public.catalog_playlists FOR DELETE TO authenticated
  USING (public.has_role('admin'));

DROP POLICY IF EXISTS "Public can read links in published playlists" ON public.catalog_playlist_tracks;
CREATE POLICY "Public can read links in published playlists" ON public.catalog_playlist_tracks FOR SELECT TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.catalog_playlists p WHERE p.id = playlist_id AND (p.status = 'published' OR (auth.uid() IS NOT NULL AND public.has_role('admin'))))
    AND EXISTS (SELECT 1 FROM public.songs s WHERE s.id = song_id AND (s.status = 'published' OR (auth.uid() IS NOT NULL AND public.has_role('admin'))))
  );
DROP POLICY IF EXISTS "Admins can insert playlist links" ON public.catalog_playlist_tracks;
CREATE POLICY "Admins can insert playlist links" ON public.catalog_playlist_tracks FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'));
DROP POLICY IF EXISTS "Admins can delete playlist links" ON public.catalog_playlist_tracks;
CREATE POLICY "Admins can delete playlist links" ON public.catalog_playlist_tracks FOR DELETE TO authenticated
  USING (public.has_role('admin'));
DROP POLICY IF EXISTS "Admins can update playlist links" ON public.catalog_playlist_tracks;
CREATE POLICY "Admins can update playlist links" ON public.catalog_playlist_tracks FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS "Public can read published artists; admins can read all" ON public.artists;
CREATE POLICY "Public can read published artists; admins can read all"
  ON public.artists FOR SELECT TO anon, authenticated
  USING (status = 'published' OR (auth.uid() IS NOT NULL AND public.has_role('admin')));
DROP POLICY IF EXISTS "Admins can insert artists" ON public.artists;
CREATE POLICY "Admins can insert artists" ON public.artists FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin') AND created_by = auth.uid());
DROP POLICY IF EXISTS "Admins can update artists" ON public.artists;
CREATE POLICY "Admins can update artists" ON public.artists FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
DROP POLICY IF EXISTS "Admins can delete artists" ON public.artists;
CREATE POLICY "Admins can delete artists" ON public.artists FOR DELETE TO authenticated
  USING (public.has_role('admin'));

-- Public bucket: uploading an audio file is a Publish action in this phase.
-- Public reads are intentional so visitors do not need an account to listen.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'surdhara-audio',
  'surdhara-audio',
  true,
  104857600,
  ARRAY['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/vnd.wave','audio/mp4','audio/m4a','audio/x-m4a','audio/aac','audio/ogg','audio/flac','audio/x-flac','audio/opus','audio/x-opus+ogg','audio/webm','audio/aiff','audio/x-aiff','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can upload SURDHARA audio" ON storage.objects;
CREATE POLICY "Admins can upload SURDHARA audio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'surdhara-audio' AND public.has_role('admin'));
DROP POLICY IF EXISTS "Admins can update SURDHARA audio" ON storage.objects;
CREATE POLICY "Admins can update SURDHARA audio" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'surdhara-audio' AND public.has_role('admin'))
  WITH CHECK (bucket_id = 'surdhara-audio' AND public.has_role('admin'));
DROP POLICY IF EXISTS "Admins can delete SURDHARA audio" ON storage.objects;
CREATE POLICY "Admins can delete SURDHARA audio" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'surdhara-audio' AND public.has_role('admin'));

-- Let currently open websites discover catalog publications and refetch the public rows.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.songs;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication is unavailable; page reload/focus refresh will still update the catalogue.';
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.catalog_playlists;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication is unavailable.';
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.catalog_playlist_tracks;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication is unavailable.';
END $$;

-- After your account has signed in and received the 'user' role, grant Admin using:
-- UPDATE public.user_roles ur SET role = 'admin'
-- FROM auth.users au WHERE au.id = ur.user_id AND lower(au.email) = lower('your-admin-email@example.com');
