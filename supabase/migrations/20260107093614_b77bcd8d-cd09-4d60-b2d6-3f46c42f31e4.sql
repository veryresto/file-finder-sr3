-- Add house_number column to profiles table
ALTER TABLE public.profiles
ADD COLUMN house_number VARCHAR(25) DEFAULT NULL;