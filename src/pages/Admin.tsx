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

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

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
  last_active_at: string | null;
  isAdmin: boolean;
  isRejected: boolean;
  canReadFiles: boolean;
  canUploadFiles: boolean;
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, getToken } = useAuth();
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
      const token = await getToken();

      const [profilesRes, rolesRes, permissionsRes, authInfoRes] = await Promise.all([
        fetch(`${EDGE_BASE}/list-profiles`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${EDGE_BASE}/list-roles`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${EDGE_BASE}/list-permissions`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${EDGE_BASE}/get-users-auth-info`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      // Fallback: fetch profiles + roles + permissions directly via supabase client
      // (until dedicated list-* functions exist, we use the same pattern as before
      //  but through the Supabase REST API using the anon key for read-only tables)
      // For now, fetch them via the supabase JS client that is still available for
      // reading non-sensitive data (RLS will be disabled so anon key can read).
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
      );

      const [profilesResult, rolesResult, permissionsResult] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('user_permissions').select('user_id, permission'),
      ]);

      // Auth info (first_login / last_sign_in) from Clerk via updated Edge Function
      let authUsers: { id: string; created_at: string | null; last_sign_in_at: string | null }[] = [];
      const authInfoData = await authInfoRes.json().catch(() => ({}));
      authUsers = authInfoData.users ?? [];

      if (profilesResult.error) throw profilesResult.error;

      const profiles = profilesResult.data ?? [];
      const roles = rolesResult.data ?? [];
      const permissions = permissionsResult.data ?? [];

      const authInfoMap = new Map(
        authUsers.map((u) => [
          u.id,
          { first_login: u.created_at, last_sign_in: u.last_sign_in_at },
        ])
      );

      const usersWithPermissions: UserWithPermissions[] = profiles.map((profile) => {
        const userRoles = roles.filter((r) => r.user_id === profile.id);
        const userPerms = permissions.filter((p) => p.user_id === profile.id);
        const authInfo = authInfoMap.get(profile.id) ?? { first_login: null, last_sign_in: null };

        return {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          house_number: (profile as any).house_number,
          whatsapp_number: (profile as any).whatsapp_number,
          created_at: profile.created_at,
          first_login: authInfo.first_login,
          last_sign_in: authInfo.last_sign_in,
          last_active_at: (profile as any).last_active_at || null,
          isAdmin: userRoles.some((r) => r.role === 'admin'),
          isRejected: userPerms.some((p) => p.permission === 'rejected'),
          canReadFiles: userPerms.some((p) => p.permission === 'read_files'),
          canUploadFiles: userPerms.some((p) => p.permission === 'upload_files'),
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

  /** Call manage-permissions Edge Function */
  const managePermission = async (body: object) => {
    const token = await getToken();
    const res = await fetch(`${EDGE_BASE}/manage-permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const togglePermission = async (
    userId: string,
    permission: 'read_files' | 'upload_files',
    currentValue: boolean
  ) => {
    setUpdating(`${userId}-${permission}`);
    try {
      await managePermission({
        action: currentValue ? 'revoke' : 'grant',
        userId,
        permission,
      });

      setUsers((prev) =>
        prev.map((u) => {
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
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  const rejectUser = async (userId: string) => {
    setUpdating(`${userId}-reject`);
    try {
      await managePermission({ action: 'reject', userId });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, isRejected: true, canReadFiles: false, canUploadFiles: false }
            : u
        )
      );

      toast({ title: 'User rejected', description: 'User moved to rejected list' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  const unrejectUser = async (userId: string) => {
    setUpdating(`${userId}-unreject`);
    try {
      await managePermission({ action: 'unreject', userId });

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isRejected: false } : u))
      );

      toast({ title: 'User restored', description: 'User moved back to pending list' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUsers.size === 0) return;

    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${EDGE_BASE}/delete-users`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userIds: Array.from(selectedUsers) }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Delete failed (${res.status})`);

      const deletedIds = data.results
        .filter((r: any) => r.success)
        .map((r: any) => r.userId);

      setUsers((prev) => prev.filter((u) => !deletedIds.includes(u.id)));
      setSelectedUsers(new Set());

      toast({ title: 'Users deleted', description: data.message });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete users', variant: 'destructive' });
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || '??';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const selectableUsers = users.filter((u) => !u.isAdmin && !u.isRejected && u.id !== user?.id);
  const allSelectableSelected =
    selectableUsers.length > 0 && selectableUsers.every((u) => selectedUsers.has(u.id));

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(selectableUsers.map((u) => u.id)));
    }
  };

  const getStatusBadge = (userItem: UserWithPermissions) => {
    if (userItem.isAdmin) return <Badge className="bg-primary/20 text-primary border-primary/30">Admin</Badge>;
    if (userItem.isRejected) return <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30">Rejected</Badge>;
    if (userItem.canReadFiles || userItem.canUploadFiles) return <Badge variant="secondary" className="bg-green-500/20 text-green-600 border-green-500/30">Approved</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">Pending</Badge>;
  };

  const activeUsers = users.filter((u) => !u.isRejected);
  const rejectedUsers = users.filter((u) => u.isRejected);

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
            <Button variant="outline" size="sm" onClick={() => navigate('/activity')} className="gap-2">
              <Activity className="h-4 w-4" />
              Activity Log
            </Button>
            {selectedUsers.size > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)} className="gap-2">
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
                  <TableHead>Last Active</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1"><Eye className="h-4 w-4" /> Read</div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1"><Upload className="h-4 w-4" /> Upload</div>
                  </TableHead>
                  <TableHead className="text-center w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeUsers.map((userItem) => {
                  const isSelectable = !userItem.isAdmin && userItem.id !== user?.id;
                  const isPending = !userItem.isAdmin && !userItem.canReadFiles && !userItem.canUploadFiles;
                  return (
                    <TableRow key={userItem.id} className={selectedUsers.has(userItem.id) ? 'bg-destructive/5' : ''}>
                      <TableCell>
                        {isSelectable ? (
                          <Checkbox checked={selectedUsers.has(userItem.id)} onCheckedChange={() => toggleUserSelection(userItem.id)} />
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
                      <TableCell><span className="text-sm font-medium">{userItem.house_number || '-'}</span></TableCell>
                      <TableCell><span className="text-sm">{userItem.whatsapp_number || '-'}</span></TableCell>
                      <TableCell><span className="text-xs text-muted-foreground">{formatDate(userItem.first_login)}</span></TableCell>
                      <TableCell><span className="text-xs text-muted-foreground">{formatDate(userItem.last_active_at)}</span></TableCell>
                      <TableCell>{getStatusBadge(userItem)}</TableCell>
                      <TableCell className="text-center">
                        {userItem.isAdmin ? (
                          <Check className="h-5 w-5 text-primary mx-auto" />
                        ) : (
                          <Switch
                            checked={userItem.canReadFiles}
                            onCheckedChange={() => togglePermission(userItem.id, 'read_files', userItem.canReadFiles)}
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
                            onCheckedChange={() => togglePermission(userItem.id, 'upload_files', userItem.canUploadFiles)}
                            disabled={updating === `${userItem.id}-upload_files`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {!userItem.isAdmin && isPending && (
                          <Button
                            variant="ghost" size="sm"
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
                  {rejectedUsers.map((userItem) => (
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
                      <TableCell><span className="text-sm font-medium">{userItem.house_number || '-'}</span></TableCell>
                      <TableCell><span className="text-sm">{userItem.whatsapp_number || '-'}</span></TableCell>
                      <TableCell><span className="text-xs text-muted-foreground">{formatDate(userItem.first_login)}</span></TableCell>
                      <TableCell>{getStatusBadge(userItem)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost" size="sm"
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
