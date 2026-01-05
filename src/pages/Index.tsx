import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/Header';
import { FileList } from '@/components/FileList';
import { FileUploadModal } from '@/components/FileUploadModal';
import { FileViewerModal } from '@/components/FileViewerModal';
import { LoginScreen } from '@/components/LoginScreen';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
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
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [files, setFiles] = useState<FileWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileWithProfile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileWithProfile | null>(null);

  const fetchFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select(`
          id,
          name,
          storage_path,
          content,
          file_size,
          created_at,
          uploader_id,
          profiles (
            email,
            full_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
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

  useEffect(() => {
    if (user) {
      fetchFiles();
    }
  }, [user]);

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
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('text-files')
        .remove([fileToDelete.storage_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', fileToDelete.id);

      if (dbError) throw dbError;

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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onUploadClick={() => setUploadModalOpen(true)}
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
    </div>
  );
};

export default Index;
