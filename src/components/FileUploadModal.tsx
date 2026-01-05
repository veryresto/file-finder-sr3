import { useState, useCallback } from 'react';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface FileUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete: () => void;
}

export function FileUploadModal({ open, onOpenChange, onUploadComplete }: FileUploadModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const validateFiles = (fileList: FileList | File[]) => {
    const validFiles: File[] = [];
    const allowedTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    const allowedExtensions = ['.txt', '.md', '.csv', '.json', '.log'];

    Array.from(fileList).forEach(file => {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (allowedTypes.includes(file.type) || allowedExtensions.includes(extension)) {
        validFiles.push(file);
      }
    });

    return validFiles;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const validFiles = validateFiles(e.dataTransfer.files);
    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    } else {
      toast({
        title: 'Invalid file type',
        description: 'Please upload text files only (.txt, .md, .csv, .json, .log)',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const validFiles = validateFiles(e.target.files);
      if (validFiles.length > 0) {
        setFiles(prev => [...prev, ...validFiles]);
      } else {
        toast({
          title: 'Invalid file type',
          description: 'Please upload text files only (.txt, .md, .csv, .json, .log)',
          variant: 'destructive',
        });
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (!user || files.length === 0) return;

    setUploading(true);

    try {
      for (const file of files) {
        // Read file content
        const content = await file.text();
        
        // Upload to storage
        const storagePath = `${user.id}/${Date.now()}-${file.name}`;
        const { error: storageError } = await supabase.storage
          .from('text-files')
          .upload(storagePath, file);

        if (storageError) throw storageError;

        // Insert file record with content for search
        const { error: dbError } = await supabase.from('files').insert({
          name: file.name,
          storage_path: storagePath,
          content: content,
          uploader_id: user.id,
          file_size: file.size,
          mime_type: file.type || 'text/plain',
        });

        if (dbError) throw dbError;
      }

      toast({
        title: 'Upload successful',
        description: `${files.length} file(s) uploaded successfully`,
      });

      setFiles([]);
      onUploadComplete();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'An error occurred during upload',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Text Files</DialogTitle>
          <DialogDescription>
            Drag and drop text files or click to browse. Supported: .txt, .md, .csv, .json, .log
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative flex flex-col items-center justify-center
            h-48 rounded-lg border-2 border-dashed transition-colors cursor-pointer
            ${isDragOver 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50 hover:bg-accent/30'
            }
          `}
        >
          <input
            type="file"
            multiple
            accept=".txt,.md,.csv,.json,.log,text/plain,text/markdown,text/csv,application/json"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <Upload className={`h-10 w-10 mb-3 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
          <p className="text-sm font-medium">
            {isDragOver ? 'Drop files here' : 'Drop files here or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Text files up to 10MB
          </p>
        </div>

        {files.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 animate-fade-in"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={uploadFiles} disabled={files.length === 0 || uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              `Upload ${files.length > 0 ? `(${files.length})` : ''}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
