import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Permissions {
  isAdmin: boolean;
  isPlatformApproved: boolean;
  isApproved: boolean;
  isRejected: boolean;
  canReadFiles: boolean;
  canUploadFiles: boolean;
  loading: boolean;
  resolvedUserId: string | null;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPlatformApproved, setIsPlatformApproved] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [canReadFiles, setCanReadFiles] = useState(false);
  const [canUploadFiles, setCanUploadFiles] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setIsPlatformApproved(false);
      setIsRejected(false);
      setCanReadFiles(false);
      setCanUploadFiles(false);
      setResolvedUserId(null);
      setLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      setLoading(true);
      try {
        // Check if user is global admin or has ipl_finder local admin role
        const [globalAdminRes, localAdminRes] = await Promise.all([
          supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .maybeSingle(),
          (supabase as any)
            .from('user_app_roles')
            .select(`
              app_roles!inner (
                name,
                applications!inner (
                  slug
                )
              )
            `)
            .eq('user_id', user.id)
            .eq('app_roles.name', 'admin')
            .eq('app_roles.applications.slug', 'ipl_finder')
            .maybeSingle()
        ]);

        const isGlobalAdmin = !!globalAdminRes.data;
        const isLocalAdmin = !!localAdminRes.data;
        const adminStatus = isGlobalAdmin || isLocalAdmin;
        setIsAdmin(adminStatus);

        // Fetch central profiles approval_status
        const { data: profile } = await supabase
          .from('profiles')
          .select('approval_status')
          .eq('id', user.id)
          .maybeSingle();

        const status = profile?.approval_status || 'pending';
        setIsPlatformApproved(status === 'approved');
        setIsRejected(status === 'rejected');

        if (adminStatus) {
          // Admins have all permissions
          setCanReadFiles(true);
          setCanUploadFiles(true);
        } else {
          // Resolve namespaced permissions from central App-RBAC
          const [readRes, uploadRes] = await Promise.all([
            supabase.rpc('has_namespaced_permission', { user_id: user.id, namespaced_perm: 'ipl_finder.read_files' }),
            supabase.rpc('has_namespaced_permission', { user_id: user.id, namespaced_perm: 'ipl_finder.upload_files' })
          ]);
          setCanReadFiles(!!readRes.data);
          setCanUploadFiles(!!uploadRes.data);
        }
        setResolvedUserId(user.id);
      } catch (error) {
        console.error('Error fetching permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [user]);

  const isApproved = isAdmin || canReadFiles || canUploadFiles;

  return { isAdmin, isPlatformApproved, isApproved, isRejected, canReadFiles, canUploadFiles, loading, resolvedUserId };
}
