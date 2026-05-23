-- =============================================================================
-- IPL Finder: Permission Consolidation + Storage RLS Fix
-- =============================================================================
-- Goals:
--   1. Add 'rejected' marker app role for ipl_finder (admin UI categorisation only)
--   2. Migrate existing user_permissions rows → user_app_roles
--   3. Update files RLS to use has_namespaced_permission (single source of truth)
--   4. Fix storage bucket read policy (was: any authenticated user)
--   5. Drop legacy sync trigger, user_permissions table, orphaned helper functions
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Step 0: Drop the legacy sync trigger FIRST
-- The sync_legacy_permissions() trigger fires on every INSERT into user_app_roles.
-- Its body contains a broken comparison (user_permissions.user_id text vs uuid)
-- which would cause the Step 2 data migration INSERTs to fail.
-- Drop it before any data migration runs.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS sync_legacy_permissions_trg ON public.user_app_roles;
DROP FUNCTION IF EXISTS public.sync_legacy_permissions();


-- -----------------------------------------------------------------------------
-- Step 1: Add 'rejected' marker app role for ipl_finder
-- This role carries NO app_role_permissions rows — it has no capabilities.
-- It is assigned to users explicitly blocked by an admin, and is used only by
-- the Admin.tsx UI to categorise users in the "Rejected Users" section.
-- -----------------------------------------------------------------------------
INSERT INTO public.app_roles (app_id, name, description)
SELECT id, 'rejected', 'Explicitly blocked from accessing this application'
FROM public.applications
WHERE slug = 'ipl_finder'
ON CONFLICT (app_id, name) DO NOTHING;


-- -----------------------------------------------------------------------------
-- Step 2: Migrate existing user_permissions data → user_app_roles
--
-- Mapping:
--   upload_files permission  →  ipl_finder.admin role  (read + upload)
--   read_files only          →  ipl_finder.resident role  (read only)
--   rejected permission      →  ipl_finder.rejected marker role
--
-- Note: users with upload_files are assigned the 'admin' role which already
-- implies read_files via app_role_permissions. Do NOT double-assign 'resident'.
-- -----------------------------------------------------------------------------

-- 2a. Users with upload_files → ipl_finder.admin (covers read + upload)
INSERT INTO public.user_app_roles (user_id, app_role_id)
SELECT
  up.user_id::uuid,
  ar.id
FROM public.user_permissions up
JOIN public.app_roles ar ON ar.name = 'admin'
JOIN public.applications app ON ar.app_id = app.id AND app.slug = 'ipl_finder'
WHERE up.permission = 'upload_files'
ON CONFLICT (user_id, app_role_id) DO NOTHING;

-- 2b. Users with read_files ONLY (no upload_files) → ipl_finder.resident
INSERT INTO public.user_app_roles (user_id, app_role_id)
SELECT
  up.user_id::uuid,
  ar.id
FROM public.user_permissions up
JOIN public.app_roles ar ON ar.name = 'resident'
JOIN public.applications app ON ar.app_id = app.id AND app.slug = 'ipl_finder'
WHERE up.permission = 'read_files'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_permissions up2
    WHERE up2.user_id = up.user_id
      AND up2.permission = 'upload_files'
  )
ON CONFLICT (user_id, app_role_id) DO NOTHING;

-- 2c. Users with rejected permission → ipl_finder.rejected marker role
INSERT INTO public.user_app_roles (user_id, app_role_id)
SELECT
  up.user_id::uuid,
  ar.id
FROM public.user_permissions up
JOIN public.app_roles ar ON ar.name = 'rejected'
JOIN public.applications app ON ar.app_id = app.id AND app.slug = 'ipl_finder'
WHERE up.permission = 'rejected'
ON CONFLICT (user_id, app_role_id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- Step 3: Update files table RLS policies to use has_namespaced_permission
-- Replaces has_permission() calls which referenced the legacy table.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Approved users can view files" ON public.files;
CREATE POLICY "Approved users can view files"
ON public.files FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id::text = auth.uid()::text AND role::text = 'admin') OR
  has_namespaced_permission(auth.uid(), 'ipl_finder.read_files')
);

DROP POLICY IF EXISTS "Users with upload permission can upload files" ON public.files;
CREATE POLICY "Users with upload permission can upload files"
ON public.files FOR INSERT
WITH CHECK (
  auth.uid()::text = uploader_id AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id::text = auth.uid()::text AND role::text = 'admin') OR
    has_namespaced_permission(auth.uid(), 'ipl_finder.upload_files')
  )
);

DROP POLICY IF EXISTS "Users can delete files" ON public.files;
CREATE POLICY "Users can delete files"
ON public.files FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id::text = auth.uid()::text AND role::text = 'admin') OR
  (auth.uid()::text = uploader_id AND has_namespaced_permission(auth.uid(), 'ipl_finder.upload_files'))
);


-- -----------------------------------------------------------------------------
-- Step 4: Fix storage bucket RLS
-- Before: any authenticated ecosystem user could download files via direct
--         storage.download() calls, bypassing the files table RLS entirely.
-- After:  requires the same read_files permission as the files table.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can read files" ON storage.objects;
CREATE POLICY "Approved users can read files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'text-files' AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id::text = auth.uid()::text AND role::text = 'admin') OR
    has_namespaced_permission(auth.uid(), 'ipl_finder.read_files')
  )
);

DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
CREATE POLICY "Users with upload permission can upload files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'text-files' AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id::text = auth.uid()::text AND role::text = 'admin') OR
    has_namespaced_permission(auth.uid(), 'ipl_finder.upload_files')
  )
);


-- -----------------------------------------------------------------------------
-- Step 5: Drop remaining legacy infrastructure
-- (Trigger + sync function already dropped in Step 0)
-- -----------------------------------------------------------------------------

-- 5a. Drop the legacy user_permissions table
DROP TABLE IF EXISTS public.user_permissions;

-- 5b. Drop helper functions that were only used by the legacy RLS policies.
--     has_role() is deliberately kept — still used by activity_logs RLS,
--     get-users-auth-info edge function, and delete-users edge function.
DROP FUNCTION IF EXISTS public.has_permission(uuid, user_permission);
DROP FUNCTION IF EXISTS public.is_approved(uuid);

-- 5c. Drop the legacy enum type (no longer referenced anywhere)
DROP TYPE IF EXISTS public.user_permission;
