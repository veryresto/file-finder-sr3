import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, Shield, Upload, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface UserWithPermissions {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  house_number: string | null;
  created_at: string;
  isAdmin: boolean;
  canReadFiles: boolean;
  canUploadFiles: boolean;
}

export default function Admin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: permLoading } = usePermissions();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!permLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, permLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get all roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Get all permissions
      const { data: permissions, error: permError } = await supabase
        .from('user_permissions')
        .select('user_id, permission');

      if (permError) throw permError;

      // Combine data
      const usersWithPermissions: UserWithPermissions[] = (profiles || []).map(profile => {
        const userRoles = roles?.filter(r => r.user_id === profile.id) || [];
        const userPerms = permissions?.filter(p => p.user_id === profile.id) || [];

        return {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          house_number: profile.house_number,
          created_at: profile.created_at,
          isAdmin: userRoles.some(r => r.role === 'admin'),
          canReadFiles: userPerms.some(p => p.permission === 'read_files'),
          canUploadFiles: userPerms.some(p => p.permission === 'upload_files'),
        };
      });

      setUsers(usersWithPermissions);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const sendApprovalNotification = async (
    userItem: UserWithPermissions,
    newPermission: string
  ) => {
    try {
      // Get current permissions for the user
      const currentPermissions = [];
      if (userItem.canReadFiles || newPermission === 'read_files') currentPermissions.push('read_files');
      if (userItem.canUploadFiles || newPermission === 'upload_files') currentPermissions.push('upload_files');

      // Only send notification if this is their first approval (going from 0 to 1+ permissions)
      const hadNoPermissions = !userItem.canReadFiles && !userItem.canUploadFiles;
      
      if (hadNoPermissions && userItem.email) {
        console.log('Sending approval notification to:', userItem.email);
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'user_approved',
            userEmail: userItem.email,
            userName: userItem.full_name,
            permissions: currentPermissions,
          },
        });
      }
    } catch (error) {
      console.error('Failed to send approval notification:', error);
      // Don't throw - notification failure shouldn't block the permission update
    }
  };

  const togglePermission = async (
    userId: string,
    permission: 'read_files' | 'upload_files',
    currentValue: boolean
  ) => {
    setUpdating(`${userId}-${permission}`);
    const userItem = users.find(u => u.id === userId);
    
    try {
      if (currentValue) {
        // Remove permission
        const { error } = await supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('permission', permission);

        if (error) throw error;
      } else {
        // Add permission
        const { error } = await supabase
          .from('user_permissions')
          .insert({
            user_id: userId,
            permission: permission,
            granted_by: user?.id,
          });

        if (error) throw error;

        // Send approval notification if this is the user's first permission
        if (userItem) {
          await sendApprovalNotification(userItem, permission);
        }
      }

      // Update local state
      setUsers(prev =>
        prev.map(u => {
          if (u.id === userId) {
            return {
              ...u,
              canReadFiles: permission === 'read_files' ? !currentValue : u.canReadFiles,
              canUploadFiles: permission === 'upload_files' ? !currentValue : u.canUploadFiles,
            };
          }
          return u;
        })
      );

      toast({
        title: 'Permission updated',
        description: `${permission.replace('_', ' ')} permission ${currentValue ? 'revoked' : 'granted'}`,
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      toast({
        title: 'Error',
        description: 'Failed to update permission',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || '??';
  };

  const getStatusBadge = (userItem: UserWithPermissions) => {
    if (userItem.isAdmin) {
      return <Badge className="bg-primary/20 text-primary border-primary/30">Admin</Badge>;
    }
    if (userItem.canReadFiles || userItem.canUploadFiles) {
      return <Badge variant="secondary" className="bg-green-500/20 text-green-600 border-green-500/30">Approved</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">Pending</Badge>;
  };

  if (permLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">User Management</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>House #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Eye className="h-4 w-4" />
                    Read
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Upload className="h-4 w-4" />
                    Upload
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(userItem => (
                <TableRow key={userItem.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={userItem.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(userItem.full_name, userItem.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{userItem.full_name || 'No name'}</div>
                        <div className="text-sm text-muted-foreground">{userItem.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {userItem.house_number || '-'}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(userItem)}</TableCell>
                  <TableCell className="text-center">
                    {userItem.isAdmin ? (
                      <Check className="h-5 w-5 text-primary mx-auto" />
                    ) : (
                      <Switch
                        checked={userItem.canReadFiles}
                        onCheckedChange={() =>
                          togglePermission(userItem.id, 'read_files', userItem.canReadFiles)
                        }
                        disabled={updating === `${userItem.id}-read_files`}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {userItem.isAdmin ? (
                      <Check className="h-5 w-5 text-primary mx-auto" />
                    ) : (
                      <Switch
                        checked={userItem.canUploadFiles}
                        onCheckedChange={() =>
                          togglePermission(userItem.id, 'upload_files', userItem.canUploadFiles)
                        }
                        disabled={updating === `${userItem.id}-upload_files`}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
