-- SURDHARA Phase 3: account-specific preferences plus media artwork storage.
-- Prerequisite: run phase1-auth.sql and phase2-cloud-music.sql first.
-- Run this entire script in Supabase Dashboard > SQL Editor as project owner.

-- Personal data is stored by authenticated user, never shared with other accounts.
CREATE TABLE IF NOT EXISTS public.user_library_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  favorites text[] NOT NULL DEFAULT '{}',
  recently_played text[] NOT NULL DEFAULT '{}',
  custom_playlists jsonb NOT NULL DEFAULT '[]'::jsonb,
  playlist_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  playlist_removals jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_playlists_must_be_array CHECK (jsonb_typeof(custom_playlists) = 'array'),
  CONSTRAINT playlist_overrides_must_be_object CHECK (jsonb_typeof(playlist_overrides) = 'object'),
  CONSTRAINT playlist_removals_must_be_object CHECK (jsonb_typeof(playlist_removals) = 'object')
);

ALTER TABLE public.user_library_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_library_state TO authenticated;

DROP POLICY IF EXISTS "Users can read only their own music library state" ON public.user_library_state;
CREATE POLICY "Users can read only their own music library state"
  ON public.user_library_state FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users can create only their own music library state" ON public.user_library_state;
CREATE POLICY "Users can create only their own music library state"
  ON public.user_library_state FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users can update only their own music library state" ON public.user_library_state;
CREATE POLICY "Users can update only their own music library state"
  ON public.user_library_state FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users can delete only their own music library state" ON public.user_library_state;
CREATE POLICY "Users can delete only their own music library state"
  ON public.user_library_state FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Public artwork URLs may be read by everyone. Only an Admin can add/change/remove artwork.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'surdhara-artwork',
  'surdhara-artwork',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can upload SURDHARA artwork" ON storage.objects;
CREATE POLICY "Admins can upload SURDHARA artwork"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'surdhara-artwork' AND public.has_role('admin'));
DROP POLICY IF EXISTS "Admins can update SURDHARA artwork" ON storage.objects;
CREATE POLICY "Admins can update SURDHARA artwork"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'surdhara-artwork' AND public.has_role('admin'))
  WITH CHECK (bucket_id = 'surdhara-artwork' AND public.has_role('admin'));
DROP POLICY IF EXISTS "Admins can delete SURDHARA artwork" ON storage.objects;
CREATE POLICY "Admins can delete SURDHARA artwork"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'surdhara-artwork' AND public.has_role('admin'));

-- Add artist metadata changes to the realtime publication where supported.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.artists;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication unavailable; artist metadata will refresh on focus/reload.';
END $$;

-- After sign-in, grant Admin to your exact account using the project-owner SQL editor:
-- UPDATE public.user_roles ur SET role = 'admin'
-- FROM auth.users au
-- WHERE au.id = ur.user_id AND lower(au.email) = lower('your-admin-email@example.com');
