import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

interface Permissions {
  isAdmin: boolean;
  isApproved: boolean;
  isRejected: boolean;
  canReadFiles: boolean;
  canUploadFiles: boolean;
  loading: boolean;
}

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export function usePermissions(): Permissions {
  const { user, getToken, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [canReadFiles, setCanReadFiles] = useState(false);
  const [canUploadFiles, setCanUploadFiles] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

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
        const token = await getToken();
        const res = await fetch(`${EDGE_BASE}/get-my-permissions`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const { roles, permissions } = await res.json();

        const admin = roles.includes('admin');
        setIsAdmin(admin);

        if (admin) {
          setCanReadFiles(true);
          setCanUploadFiles(true);
          setIsRejected(false);
        } else {
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
  }, [user, authLoading]);

  const isApproved = isAdmin || canReadFiles || canUploadFiles;

  return { isAdmin, isApproved, isRejected, canReadFiles, canUploadFiles, loading };
}
