-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create permission enum
CREATE TYPE public.user_permission AS ENUM ('read_files', 'upload_files');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Create user_permissions table for granular permissions
CREATE TABLE public.user_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    permission user_permission NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    granted_by uuid REFERENCES auth.users(id),
    UNIQUE (user_id, permission)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user has a role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Security definer function to check if user has a permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission user_permission)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions
    WHERE user_id = _user_id
      AND permission = _permission
  )
$$;

-- Security definer function to check if user is approved (has any permission)
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions
    WHERE user_id = _user_id
  ) OR public.has_role(_user_id, 'admin')
$$;

-- RLS policies for user_roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for user_permissions
CREATE POLICY "Admins can view all permissions"
ON public.user_permissions
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own permissions"
ON public.user_permissions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage permissions"
ON public.user_permissions
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Update files RLS to require read_files permission
DROP POLICY IF EXISTS "Authenticated users can view all files" ON public.files;
CREATE POLICY "Approved users can view files"
ON public.files
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_permission(auth.uid(), 'read_files')
);

-- Update files upload policy to require upload_files permission
DROP POLICY IF EXISTS "Users can upload files" ON public.files;
CREATE POLICY "Users with upload permission can upload files"
ON public.files
FOR INSERT
WITH CHECK (
  auth.uid() = uploader_id AND (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_permission(auth.uid(), 'upload_files')
  )
);

-- Update delete policy
DROP POLICY IF EXISTS "Users can delete own files" ON public.files;
CREATE POLICY "Users can delete own files"
ON public.files
FOR DELETE
USING (
  auth.uid() = uploader_id AND (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_permission(auth.uid(), 'upload_files')
  )
);

-- Insert initial admin user (will be done after user signs up)
-- We'll create a trigger to auto-assign admin role for specific email
CREATE OR REPLACE FUNCTION public.assign_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'veryresto@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_assign_admin
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_admin_role();