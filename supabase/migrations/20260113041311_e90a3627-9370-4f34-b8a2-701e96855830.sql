-- Add whatsapp_number column to profiles table
ALTER TABLE public.profiles
ADD COLUMN whatsapp_number character varying(25) DEFAULT NULL;