-- Update delete policy: only uploaders with upload permission can delete own files, admins can delete all
DROP POLICY IF EXISTS "Users can delete own files" ON public.files;

CREATE POLICY "Users can delete files"
ON public.files
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin') OR 
  (auth.uid() = uploader_id AND public.has_permission(auth.uid(), 'upload_files'))
);