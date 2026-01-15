import { FileText, Calendar, User, Download, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

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

interface FileViewerModalProps {
  file: FileWithProfile | null;
  searchQuery: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FileViewerModal({ file, searchQuery, open, onOpenChange }: FileViewerModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  if (!file) return null;

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.charAt(0).toUpperCase() || 'U';
  };

  const highlightMatches = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="bg-primary/30 text-foreground px-0.5 rounded">{part}</mark>
      ) : (
        part
      )
    );
  };

  const handleDownload = async () => {
    try {
      const { data, error } = await supabase.storage
        .from('text-files')
        .download(file.storage_path);

      if (error) throw error;

      // Log the download activity
      if (user) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          action: 'download',
          resource_type: 'file',
          resource_id: file.id,
          resource_name: file.name,
        });
      }

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-[95vw] h-[90vh] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 p-6 pb-4 border-b">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-left">{file.name}</DialogTitle>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={file.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                        {getInitials(file.profiles?.full_name, file.profiles?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{file.profiles?.full_name || file.profiles?.email || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{format(new Date(file.created_at), 'MMM d, yyyy \'at\' h:mm a')}</span>
                  </div>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload} className="flex-shrink-0 ml-4">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6">
            <pre className="text-sm font-mono whitespace-pre-wrap break-words bg-muted/50 rounded-lg p-4 leading-relaxed">
              {file.content ? highlightMatches(file.content, searchQuery) : 'No content available'}
            </pre>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
