import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Shield, Upload, Eye, Trash2, XCircle, RotateCcw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UserWithPermissions {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  house_number: string | null;
  whatsapp_number: string | null;
  created_at: string;
  first_login: string | null;
  last_sign_in: string | null;
  isAdmin: boolean;
  isRejected: boolean;
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
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      // Fetch all data in parallel
      const [profilesResult, rolesResult, permissionsResult, authInfoResult] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('user_permissions').select('user_id, permission'),
        supabase.functions.invoke('get-users-auth-info'),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (rolesResult.error) throw rolesResult.error;
      if (permissionsResult.error) throw permissionsResult.error;

      const profiles = profilesResult.data;
      const roles = rolesResult.data;
      const permissions = permissionsResult.data;
      const authUsers = authInfoResult.data?.users || [];

      // Create a map for quick auth info lookup
      const authInfoMap = new Map<string, { first_login: string | null; last_sign_in: string | null }>(
        authUsers.map((u: { id: string; created_at: string | null; last_sign_in_at: string | null }) => [
          u.id,
          { first_login: u.created_at, last_sign_in: u.last_sign_in_at }
        ])
      );

      // Combine data
      const usersWithPermissions: UserWithPermissions[] = (profiles || []).map(profile => {
        const userRoles = roles?.filter(r => r.user_id === profile.id) || [];
        const userPerms = permissions?.filter(p => p.user_id === profile.id) || [];
        const authInfo = authInfoMap.get(profile.id) || { first_login: null, last_sign_in: null };

        return {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          house_number: profile.house_number,
          whatsapp_number: profile.whatsapp_number,
          created_at: profile.created_at,
          first_login: authInfo.first_login,
          last_sign_in: authInfo.last_sign_in,
          isAdmin: userRoles.some(r => r.role === 'admin'),
          isRejected: userPerms.some(p => p.permission === 'rejected'),
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

  const rejectUser = async (userId: string) => {
    setUpdating(`${userId}-reject`);
    
    try {
      // Remove all existing permissions first
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId);

      // Add rejected permission
      const { error } = await supabase
        .from('user_permissions')
        .insert({
          user_id: userId,
          permission: 'rejected',
          granted_by: user?.id,
        });

      if (error) throw error;

      // Update local state
      setUsers(prev =>
        prev.map(u => {
          if (u.id === userId) {
            return {
              ...u,
              isRejected: true,
              canReadFiles: false,
              canUploadFiles: false,
            };
          }
          return u;
        })
      );

      toast({
        title: 'User rejected',
        description: 'User has been rejected and moved to rejected list',
      });
    } catch (error) {
      console.error('Error rejecting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject user',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  const unrejectUser = async (userId: string) => {
    setUpdating(`${userId}-unreject`);
    
    try {
      // Remove rejected permission
      const { error } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)
        .eq('permission', 'rejected');

      if (error) throw error;

      // Update local state
      setUsers(prev =>
        prev.map(u => {
          if (u.id === userId) {
            return {
              ...u,
              isRejected: false,
            };
          }
          return u;
        })
      );

      toast({
        title: 'User restored',
        description: 'User has been moved back to pending list',
      });
    } catch (error) {
      console.error('Error restoring user:', error);
      toast({
        title: 'Error',
        description: 'Failed to restore user',
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Selectable users are non-admins and not the current user
  // Selectable users are non-admins, not rejected, and not the current user
  const selectableUsers = users.filter(u => !u.isAdmin && !u.isRejected && u.id !== user?.id);
  const allSelectableSelected = selectableUsers.length > 0 && 
    selectableUsers.every(u => selectedUsers.has(u.id));

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(selectableUsers.map(u => u.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.size === 0) return;
    
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-users', {
        body: { userIds: Array.from(selectedUsers) },
      });

      if (error) throw error;

      // Remove deleted users from local state
      const deletedIds = data.results
        .filter((r: any) => r.success)
        .map((r: any) => r.userId);

      setUsers(prev => prev.filter(u => !deletedIds.includes(u.id)));
      setSelectedUsers(new Set());

      toast({
        title: 'Users deleted',
        description: data.message,
      });
    } catch (error: any) {
      console.error('Error deleting users:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete users',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const getStatusBadge = (userItem: UserWithPermissions) => {
    if (userItem.isAdmin) {
      return <Badge className="bg-primary/20 text-primary border-primary/30">Admin</Badge>;
    }
    if (userItem.isRejected) {
      return <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30">Rejected</Badge>;
    }
    if (userItem.canReadFiles || userItem.canUploadFiles) {
      return <Badge variant="secondary" className="bg-green-500/20 text-green-600 border-green-500/30">Approved</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">Pending</Badge>;
  };

  // Split users into active and rejected
  const activeUsers = users.filter(u => !u.isRejected);
  const rejectedUsers = users.filter(u => u.isRejected);

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
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">User Management</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/activity')}
              className="gap-2"
            >
              <Activity className="h-4 w-4" />
              Activity Log
            </Button>
            {selectedUsers.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedUsers.size})
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Active Users Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Active Users ({activeUsers.length})</h2>
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelectableSelected && selectableUsers.length > 0}
                      onCheckedChange={toggleSelectAll}
                      disabled={selectableUsers.length === 0}
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>House #</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>First Login</TableHead>
                  <TableHead>Last Sign In</TableHead>
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
                  <TableHead className="text-center w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeUsers.map(userItem => {
                  const isSelectable = !userItem.isAdmin && userItem.id !== user?.id;
                  const isPending = !userItem.isAdmin && !userItem.canReadFiles && !userItem.canUploadFiles;
                  return (
                    <TableRow key={userItem.id} className={selectedUsers.has(userItem.id) ? 'bg-destructive/5' : ''}>
                      <TableCell>
                        {isSelectable ? (
                          <Checkbox
                            checked={selectedUsers.has(userItem.id)}
                            onCheckedChange={() => toggleUserSelection(userItem.id)}
                          />
                        ) : (
                          <div className="w-4" />
                        )}
                      </TableCell>
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
                      <TableCell>
                        <span className="text-sm">
                          {userItem.whatsapp_number || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(userItem.first_login)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(userItem.last_sign_in)}
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
                      <TableCell className="text-center">
                        {!userItem.isAdmin && isPending && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => rejectUser(userItem.id)}
                            disabled={updating === `${userItem.id}-reject`}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {activeUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No active users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Rejected Users Section */}
        {rejectedUsers.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-destructive">Rejected Users ({rejectedUsers.length})</h2>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>House #</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>First Login</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center w-24">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rejectedUsers.map(userItem => (
                    <TableRow key={userItem.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={userItem.avatar_url || undefined} />
                            <AvatarFallback className="text-xs bg-destructive/10 text-destructive">
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
                      <TableCell>
                        <span className="text-sm">
                          {userItem.whatsapp_number || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(userItem.first_login)}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(userItem)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => unrejectUser(userItem.id)}
                          disabled={updating === `${userItem.id}-unreject`}
                          className="text-primary hover:text-primary hover:bg-primary/10"
                          title="Restore to pending"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </main>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedUsers.size} user(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected users will be permanently deleted
              along with all their data, permissions, and uploaded files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
