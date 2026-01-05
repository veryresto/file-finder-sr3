import { FileText, Calendar, User, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
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

interface FileListProps {
  files: FileWithProfile[];
  searchQuery: string;
  onViewFile: (file: FileWithProfile) => void;
  onDeleteFile: (file: FileWithProfile) => void;
}

export function FileList({ files, searchQuery, onViewFile, onDeleteFile }: FileListProps) {
  const { user } = useAuth();

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.charAt(0).toUpperCase() || 'U';
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? (
        <span key={i} className="highlight-match">{part}</span>
      ) : (
        part
      )
    );
  };

  const getMatchSnippet = (content: string | null, query: string) => {
    if (!content || !query.trim()) return null;
    
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matchIndex = lowerContent.indexOf(lowerQuery);
    
    if (matchIndex === -1) return null;
    
    const snippetStart = Math.max(0, matchIndex - 40);
    const snippetEnd = Math.min(content.length, matchIndex + query.length + 40);
    
    let snippet = content.slice(snippetStart, snippetEnd);
    if (snippetStart > 0) snippet = '...' + snippet;
    if (snippetEnd < content.length) snippet = snippet + '...';
    
    return snippet;
  };

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">
          {searchQuery ? 'No files found' : 'No files uploaded yet'}
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {searchQuery 
            ? `No files contain the keyword "${searchQuery}"`
            : 'Upload text files to get started. You can search through them by keyword.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {files.map((file, index) => (
        <div
          key={file.id}
          className="group flex items-center justify-between p-4 rounded-xl bg-card border border-border/50 hover:border-border hover:shadow-elevated transition-all duration-200 animate-slide-up"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            
            <div className="min-w-0 flex-1">
              <h3 className="font-medium truncate">
                {highlightMatch(file.name, searchQuery)}
              </h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
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
                  <span>{format(new Date(file.created_at), 'MMM d, yyyy')}</span>
                </div>
                <span className="hidden sm:inline">{formatFileSize(file.file_size)}</span>
              </div>
              
              {searchQuery && getMatchSnippet(file.content, searchQuery) && (
                <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 font-mono">
                  {highlightMatch(getMatchSnippet(file.content, searchQuery)!, searchQuery)}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onViewFile(file)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {user?.id === file.uploader_id && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDeleteFile(file)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
