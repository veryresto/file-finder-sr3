import { Search, Upload, LogOut, FileText, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onUploadClick: () => void;
  canUpload?: boolean;
  isAdmin?: boolean;
  hasPendingUsers?: boolean;
}

export function Header({ searchQuery, onSearchChange, onUploadClick, canUpload = true, isAdmin = false, hasPendingUsers = false }: HeaderProps) {
  const { user, signOut } = useAuth();

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return email?.charAt(0).toUpperCase() || "U";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-card/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between gap-4 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="hidden font-semibold text-foreground sm:inline-block">IPL Finder</span>
        </div>

        <div className="flex flex-1 max-w-xl items-center">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search files by keyword..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 bg-secondary/50 border-transparent focus:border-primary/50 focus:bg-card transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" asChild className="gap-2 relative">
              <Link to="/admin">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
                {hasPendingUsers && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive" />
                )}
              </Link>
            </Button>
          )}

          {canUpload && (
            <Button onClick={onUploadClick} size="sm" className="gap-2">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage
                    src={user?.user_metadata?.avatar_url}
                    alt={user?.user_metadata?.full_name || user?.email || "User"}
                  />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(user?.user_metadata?.full_name, user?.email)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex items-center gap-2 p-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.user_metadata?.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(user?.user_metadata?.full_name, user?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col space-y-0.5">
                  <p className="text-sm font-medium">{user?.user_metadata?.full_name || "User"}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">{user?.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
