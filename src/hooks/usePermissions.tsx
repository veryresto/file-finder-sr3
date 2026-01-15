import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Permissions {
  isAdmin: boolean;
  isApproved: boolean;
  isRejected: boolean;
  canReadFiles: boolean;
  canUploadFiles: boolean;
  loading: boolean;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [canReadFiles, setCanReadFiles] = useState(false);
  const [canUploadFiles, setCanUploadFiles] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setIsRejected(false);
      setCanReadFiles(false);
      setCanUploadFiles(false);
      setLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      try {
        // Check if user is admin
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        const adminStatus = !!roleData;
        setIsAdmin(adminStatus);

        if (adminStatus) {
          // Admins have all permissions
          setCanReadFiles(true);
          setCanUploadFiles(true);
          setIsRejected(false);
        } else {
          // Check specific permissions
          const { data: permData } = await supabase
            .from('user_permissions')
            .select('permission')
            .eq('user_id', user.id);

          const permissions = permData?.map(p => p.permission) || [];
          setIsRejected(permissions.includes('rejected'));
          setCanReadFiles(permissions.includes('read_files'));
          setCanUploadFiles(permissions.includes('upload_files'));
        }
      } catch (error) {
        console.error('Error fetching permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [user]);

  const isApproved = isAdmin || canReadFiles || canUploadFiles;

  return { isAdmin, isApproved, isRejected, canReadFiles, canUploadFiles, loading };
}
