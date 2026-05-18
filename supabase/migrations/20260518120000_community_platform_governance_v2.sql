-- 1. Create approval_status enum type
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');

-- 2. Add columns to profiles table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS house_number TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS approval_status public.approval_status DEFAULT 'pending';

-- Set all existing profiles with an admin role to 'approved', others to 'pending'
UPDATE public.profiles p
SET approval_status = 'approved'
FROM public.user_roles ur
WHERE p.id::text = ur.user_id::text AND ur.role::text = 'admin';

-- 3. Add values to global app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'resident_verifier';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_moderator';

-- 4. Create Audit Trail Table
CREATE TABLE public.governance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for governance events
ALTER TABLE public.governance_events ENABLE ROW LEVEL SECURITY;

-- Policies for governance events
CREATE POLICY "Admins and verifiers can view governance events"
  ON public.governance_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id::text = auth.uid()::text 
    AND role::text IN ('admin', 'resident_verifier')
  ));

CREATE POLICY "Authorized system and managers can create governance events"
  ON public.governance_events FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id::text = auth.uid()::text 
    AND role::text IN ('admin', 'resident_verifier', 'platform_moderator')
  ));

-- 5. Create Applications & App Permissions Tables
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.app_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, -- e.g. 'read_files', 'upload_files'
  description TEXT,
  UNIQUE(app_id, name)
);

CREATE TABLE public.app_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL, -- e.g. 'admin', 'resident'
  description TEXT,
  UNIQUE(app_id, name)
);

CREATE TABLE public.app_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_role_id UUID REFERENCES public.app_roles(id) ON DELETE CASCADE NOT NULL,
  permission_id UUID REFERENCES public.app_permissions(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(app_role_id, permission_id)
);

CREATE TABLE public.user_app_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  app_role_id UUID REFERENCES public.app_roles(id) ON DELETE CASCADE NOT NULL,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, app_role_id)
);

-- Enable RLS for all new tables
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_app_roles ENABLE ROW LEVEL SECURITY;

-- Global App-RBAC RLS Policies
CREATE POLICY "Approved residents can view connected apps and roles"
  ON public.applications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id::text = auth.uid()::text AND approval_status::text = 'approved'));

CREATE POLICY "Platform managers can manage application registry"
  ON public.applications FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id::text = auth.uid()::text AND role::text = 'admin'));

CREATE POLICY "Approved residents can view app capabilities"
  ON public.app_permissions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id::text = auth.uid()::text AND approval_status::text = 'approved'));

CREATE POLICY "Approved residents can view role templates"
  ON public.app_roles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id::text = auth.uid()::text AND approval_status::text = 'approved'));

CREATE POLICY "Approved residents can view role bindings"
  ON public.app_role_permissions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id::text = auth.uid()::text AND approval_status::text = 'approved'));

CREATE POLICY "Approved residents can view active app access mappings"
  ON public.user_app_roles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id::text = auth.uid()::text AND approval_status::text = 'approved'));

CREATE POLICY "Platform managers can manage resident app role mappings"
  ON public.user_app_roles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id::text = auth.uid()::text 
    AND role::text IN ('admin', 'resident_verifier')
  ));

-- 6. Dynamic Privilege Resolution (Namespaced Permission Helper)
CREATE OR REPLACE FUNCTION public.has_namespaced_permission(
  user_id UUID,
  namespaced_perm TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  app_slug_val TEXT;
  perm_name_val TEXT;
  has_perm BOOLEAN;
  global_role_check BOOLEAN;
BEGIN
  -- 1. Global Admin always has all permissions
  IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id::text = $1::text AND ur.role::text = 'admin') THEN
    RETURN TRUE;
  END IF;

  -- 2. Extract app_slug and permission name from namespaced_perm (e.g. 'ipl_finder.upload_files')
  app_slug_val := split_part(namespaced_perm, '.', 1);
  perm_name_val := split_part(namespaced_perm, '.', 2);

  -- 3. Resolve permission templates mapping
  SELECT EXISTS (
    SELECT 1
    FROM public.user_app_roles uar
    JOIN public.app_roles ar ON uar.app_role_id = ar.id
    JOIN public.applications app ON ar.app_id = app.id
    JOIN public.app_role_permissions arp ON arp.app_role_id = ar.id
    JOIN public.app_permissions ap ON arp.permission_id = ap.id
    WHERE uar.user_id = $1
      AND app.slug = app_slug_val
      AND ap.name = perm_name_val
  ) INTO has_perm;

  RETURN has_perm;
END;
$$;

-- 7. Legacy Compatibility Stranglers Synchronization
-- Syncs user_app_roles changes back to legacy user_permissions table to keep older code functional
CREATE OR REPLACE FUNCTION public.sync_legacy_permissions()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  target_user_id UUID;
  app_slug_val TEXT;
  role_name_val TEXT;
  has_read BOOLEAN := FALSE;
  has_upload BOOLEAN := FALSE;
BEGIN
  -- Determine target user and app role depending on INSERT or DELETE action
  IF (TG_OP = 'DELETE') THEN
    target_user_id := OLD.user_id;
    SELECT app.slug, ar.name INTO app_slug_val, role_name_val
    FROM public.app_roles ar
    JOIN public.applications app ON ar.app_id = app.id
    WHERE ar.id = OLD.app_role_id;
  ELSE
    target_user_id := NEW.user_id;
    SELECT app.slug, ar.name INTO app_slug_val, role_name_val
    FROM public.app_roles ar
    JOIN public.applications app ON ar.app_id = app.id
    WHERE ar.id = NEW.app_role_id;
  END IF;

  -- We only target legacy compatibility for the 'ipl_finder' application
  IF app_slug_val = 'ipl_finder' THEN
    -- If it's a DELETE or update to 'none', we re-calculate or remove.
    -- Check what app roles user still holds for ipl_finder
    SELECT 
      EXISTS (
        SELECT 1 FROM public.user_app_roles uar
        JOIN public.app_roles ar ON uar.app_role_id = ar.id
        JOIN public.applications app ON ar.app_id = app.id
        JOIN public.app_role_permissions arp ON arp.app_role_id = ar.id
        JOIN public.app_permissions ap ON arp.permission_id = ap.id
        WHERE uar.user_id = target_user_id AND app.slug = 'ipl_finder' AND ap.name = 'read_files'
      ),
      EXISTS (
        SELECT 1 FROM public.user_app_roles uar
        JOIN public.app_roles ar ON uar.app_role_id = ar.id
        JOIN public.applications app ON ar.app_id = app.id
        JOIN public.app_role_permissions arp ON arp.app_role_id = ar.id
        JOIN public.app_permissions ap ON arp.permission_id = ap.id
        WHERE uar.user_id = target_user_id AND app.slug = 'ipl_finder' AND ap.name = 'upload_files'
      )
    INTO has_read, has_upload;

    -- Update or Insert into legacy user_permissions table
    IF EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = target_user_id) THEN
      UPDATE public.user_permissions
      SET 
        read_files = has_read,
        upload_files = has_upload
      WHERE user_id = target_user_id;
    ELSE
      INSERT INTO public.user_permissions (user_id, read_files, upload_files)
      VALUES (target_user_id, has_read, has_upload);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Trigger binding for synchronizing app roles to legacy permissions
CREATE OR REPLACE TRIGGER sync_legacy_permissions_trg
AFTER INSERT OR UPDATE OR DELETE ON public.user_app_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_permissions();

-- 8. Seed Initial Data (Applications, Permissions, and Templates)
-- Seed IPL Finder App registry
INSERT INTO public.applications (slug, name, description)
VALUES (
  'ipl_finder',
  'IPL Finder',
  'Bank Statement and CSV Document Indexing and Query Application'
) ON CONFLICT (slug) DO NOTHING;

-- Seed capabilities
INSERT INTO public.app_permissions (app_id, name, description)
SELECT id, 'read_files', 'Ability to search and view statement files'
FROM public.applications WHERE slug = 'ipl_finder'
ON CONFLICT (app_id, name) DO NOTHING;

INSERT INTO public.app_permissions (app_id, name, description)
SELECT id, 'upload_files', 'Ability to import and delete statement records'
FROM public.applications WHERE slug = 'ipl_finder'
ON CONFLICT (app_id, name) DO NOTHING;

-- Seed App Roles
INSERT INTO public.app_roles (app_id, name, description)
SELECT id, 'resident', 'Baseline resident access template'
FROM public.applications WHERE slug = 'ipl_finder'
ON CONFLICT (app_id, name) DO NOTHING;

INSERT INTO public.app_roles (app_id, name, description)
SELECT id, 'admin', 'Full administrator access template'
FROM public.applications WHERE slug = 'ipl_finder'
ON CONFLICT (app_id, name) DO NOTHING;

-- Bind Permissions to Roles
-- 1. ipl_finder resident has 'read_files'
INSERT INTO public.app_role_permissions (app_role_id, permission_id)
SELECT ar.id, ap.id
FROM public.app_roles ar
JOIN public.app_permissions ap ON ar.app_id = ap.app_id
JOIN public.applications app ON ar.app_id = app.id
WHERE app.slug = 'ipl_finder' AND ar.name = 'resident' AND ap.name = 'read_files'
ON CONFLICT (app_role_id, permission_id) DO NOTHING;

-- 2. ipl_finder admin has both 'read_files' and 'upload_files'
INSERT INTO public.app_role_permissions (app_role_id, permission_id)
SELECT ar.id, ap.id
FROM public.app_roles ar
JOIN public.app_permissions ap ON ar.app_id = ap.app_id
JOIN public.applications app ON ar.app_id = app.id
WHERE app.slug = 'ipl_finder' AND ar.name = 'admin' AND ap.name IN ('read_files', 'upload_files')
ON CONFLICT (app_role_id, permission_id) DO NOTHING;
