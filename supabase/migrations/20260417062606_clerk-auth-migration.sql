-- ============================================================
-- Migration: Clerk Auth Integration
-- Removes Supabase Auth dependencies, disables RLS,
-- and changes user ID columns to TEXT for Clerk user IDs.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop trigger that auto-created profiles from auth.users
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ------------------------------------------------------------
-- 2. Drop the FK from profiles.id → auth.users(id)
--    (Clerk user IDs are TEXT like "user_2abc...", not UUIDs)
-- ------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- ------------------------------------------------------------
-- 3. Change profiles.id from UUID → TEXT
-- ------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- ------------------------------------------------------------
-- 4. Change FK columns in user_roles and user_permissions
--    to TEXT so they can hold Clerk user IDs
-- ------------------------------------------------------------
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE public.user_permissions ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Also update granted_by column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'granted_by'
  ) THEN
    ALTER TABLE public.user_permissions ALTER COLUMN granted_by TYPE TEXT USING granted_by::TEXT;
  END IF;
END$$;

-- ------------------------------------------------------------
-- 5. Change files.uploader_id from UUID → TEXT
-- ------------------------------------------------------------
ALTER TABLE public.files ALTER COLUMN uploader_id TYPE TEXT USING uploader_id::TEXT;

-- Also drop the FK to profiles (profiles.id is now TEXT, files.uploader_id is TEXT)
-- Re-add as non-cascading TEXT FK
ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_uploader_id_fkey;
ALTER TABLE public.files
  ADD CONSTRAINT files_uploader_id_fkey
  FOREIGN KEY (uploader_id) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 6. Disable RLS on all tables
--    (authorization is now enforced in Edge Functions)
-- ------------------------------------------------------------
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;

-- Disable RLS on user_roles and user_permissions if they have it
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['user_roles', 'user_permissions'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE tablename = tbl AND schemaname = 'public'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END$$;

-- ------------------------------------------------------------
-- 7. Drop auth.uid()-dependent RLS policies — files table
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view all files" ON public.files;
DROP POLICY IF EXISTS "Users can upload files" ON public.files;
DROP POLICY IF EXISTS "Users can delete own files" ON public.files;

-- ------------------------------------------------------------
-- 8. Drop profiles RLS policies
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- ------------------------------------------------------------
-- 9. Drop Supabase Storage RLS policies
--    (storage access now goes through Edge Functions)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- Disable RLS on storage.objects for the text-files bucket
-- Note: This disables for ALL objects; Edge Functions enforce access per-bucket.
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Done. Security is now enforced at the Edge Function layer.
-- ------------------------------------------------------------
