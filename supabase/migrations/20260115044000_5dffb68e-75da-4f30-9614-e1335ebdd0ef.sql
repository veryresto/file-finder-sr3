-- Add 'rejected' to the user_permission enum
ALTER TYPE public.user_permission ADD VALUE IF NOT EXISTS 'rejected';