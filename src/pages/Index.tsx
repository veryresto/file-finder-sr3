import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/Header';
import { FileList } from '@/components/FileList';
import { FileUploadModal } from '@/components/FileUploadModal';
import { FileViewerModal } from '@/components/FileViewerModal';
import { LoginScreen } from '@/components/LoginScreen';
import { PendingApprovalScreen } from '@/components/PendingApprovalScreen';
import { RejectedScreen } from '@/components/RejectedScreen';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
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

interface FileWithProfile {
  id: string;
  name: string;
  storage_path: string;
  content: string | null;
  file_size: number | null;
  created_at: string;
  uploader_id: string;
  profiles: {
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

const Index = () => {
  const { user, loading: authLoading, getToken } = useAuth();
  const { isAdmin, isApproved, isRejected, canReadFiles, canUploadFiles, loading: permLoading } = usePermissions();
  const { toast } = useToast();

  const [files, setFiles] = useState<FileWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileWithProfile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileWithProfile | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [hasPendingUsers, setHasPendingUsers] = useState(false);

  const fetchFiles = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${EDGE_BASE}/list-files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { files: data } = await res.json();
      setFiles(data || []);
    } catch (error: any) {
      toast({
        title: 'Error loading files',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingUsers = async () => {
    if (!isAdmin) return;
    try {
      const token = await getToken();
      const res = await fetch(`${EDGE_BASE}/get-pending-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { hasPending } = await res.json();
      setHasPendingUsers(hasPending);
    } catch (error) {
      console.error('Error fetching pending users:', error);
    }
  };

  useEffect(() => {
    if (user && isApproved) {
      fetchFiles();
    } else if (user && !permLoading && !isApproved) {
      setLoading(false);
    }
  }, [user, isApproved, permLoading]);

  useEffect(() => {
    if (isAdmin) {
      fetchPendingUsers();
    }
  }, [isAdmin]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;

    const query = searchQuery.toLowerCase();
    return files.filter(file =>
      file.name.toLowerCase().includes(query) ||
      file.content?.toLowerCase().includes(query)
    );
  }, [files, searchQuery]);

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;

    try {
      const token = await getToken();
      const res = await fetch(`${EDGE_BASE}/delete-file`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId: fileToDelete.id }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }

      toast({
        title: 'File deleted',
        description: `"${fileToDelete.name}" has been deleted`,
      });

      fetchFiles();
    } catch (error: any) {
      toast({
        title: 'Error deleting file',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setFileToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedFiles.size === 0) return;

    try {
      const token = await getToken();
      const res = await fetch(`${EDGE_BASE}/delete-file`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileIds: Array.from(selectedFiles) }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }

      toast({
        title: 'Files deleted',
        description: `${selectedFiles.size} file(s) have been deleted`,
      });

      setSelectedFiles(new Set());
      fetchFiles();
    } catch (error: any) {
      toast({
        title: 'Error deleting files',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
    }
  };

  if (authLoading || permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (isRejected) {
    return <RejectedScreen />;
  }

  if (!isApproved) {
    return <PendingApprovalScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onUploadClick={() => setUploadModalOpen(true)}
        canUpload={canUploadFiles || isAdmin}
        isAdmin={isAdmin}
        hasPendingUsers={hasPendingUsers}
      />

      <main className="container px-4 md:px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">
            {searchQuery ? `Search results for "${searchQuery}"` : 'All Files'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredFiles.length} {filteredFiles.length === 1 ? 'file' : 'files'}
            {searchQuery && files.length !== filteredFiles.length && ` (${files.length} total)`}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <FileList
            files={filteredFiles}
            searchQuery={searchQuery}
            onViewFile={setSelectedFile}
            onDeleteFile={setFileToDelete}
            selectedFiles={selectedFiles}
            onToggleSelect={toggleFileSelection}
            onToggleSelectAll={toggleSelectAll}
            onBulkDelete={() => setShowBulkDeleteDialog(true)}
            isAdmin={isAdmin}
          />
        )}
      </main>

      <FileUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUploadComplete={fetchFiles}
      />

      <FileViewerModal
        file={selectedFile}
        searchQuery={searchQuery}
        open={!!selectedFile}
        onOpenChange={(open) => !open && setSelectedFile(null)}
      />

      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{fileToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFile} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFiles.size} file(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedFiles.size} selected file(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
