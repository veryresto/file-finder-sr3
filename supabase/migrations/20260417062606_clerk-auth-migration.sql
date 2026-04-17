-- ============================================================
-- Migration: Clerk Auth Integration (Updated v2)
-- Removes Supabase Auth dependencies, disables RLS,
-- and changes user ID columns to TEXT for Clerk user IDs.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop trigger that auto-created profiles from auth.users
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ------------------------------------------------------------
-- 2. Disable Row Level Security on all tables
--    (security is now enforced in Edge Functions)
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.files DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_logs DISABLE ROW LEVEL SECURITY;
-- Note: storage.objects RLS disabling skipped due to ownership limits.

-- ------------------------------------------------------------
-- 3. Drop existing RLS policies
-- ------------------------------------------------------------
-- Table: public.profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Table: public.files
DROP POLICY IF EXISTS "Authenticated users can view all files" ON public.files;
DROP POLICY IF EXISTS "Users can upload files" ON public.files;
DROP POLICY IF EXISTS "Users can delete own files" ON public.files;
DROP POLICY IF EXISTS "Approved users can view files" ON public.files;
DROP POLICY IF EXISTS "Users with upload permission can upload files" ON public.files;
DROP POLICY IF EXISTS "Users can delete files" ON public.files;

-- Tables: Roles & Permissions
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_permissions;

-- Table: public.activity_logs
DROP POLICY IF EXISTS "Admins can view all activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can insert own activity" ON public.activity_logs;

-- Table: storage.objects
DROP POLICY IF EXISTS "Authenticated users can read files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- ------------------------------------------------------------
-- 4. Drop utility functions that depend on the UUID data type
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.has_permission(uuid, public.user_permission) CASCADE;
DROP FUNCTION IF EXISTS public.is_approved(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.assign_admin_role() CASCADE;
DROP TRIGGER IF EXISTS on_profile_created_assign_admin ON public.profiles;

-- ------------------------------------------------------------
-- 5. Drop the old FK constraints
-- ------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_uploader_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_user_id_fkey;
ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_granted_by_fkey;

-- ------------------------------------------------------------
-- 6. Change ID columns from UUID → TEXT
-- ------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE public.user_permissions ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE public.files ALTER COLUMN uploader_id TYPE TEXT USING uploader_id::TEXT;
ALTER TABLE public.activity_logs ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Convert activity_logs.resource_id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activity_logs' AND column_name = 'resource_id'
  ) THEN
    ALTER TABLE public.activity_logs ALTER COLUMN resource_id TYPE TEXT USING resource_id::TEXT;
  END IF;
END$$;

-- Also update granted_by column if it exists in user_permissions
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
-- 7. Re-add ForeignKey constraints (TEXT)
-- ------------------------------------------------------------
ALTER TABLE public.files
  ADD CONSTRAINT files_uploader_id_fkey
  FOREIGN KEY (uploader_id) REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- ------------------------------------------------------------
-- Done. Security is now enforced at the Edge Function layer.
-- ------------------------------------------------------------
