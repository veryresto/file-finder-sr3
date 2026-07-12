import { Search, Upload, LogOut, FileText, Shield, LayoutGrid } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

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
  const { participantType, residentSubtype, requestedAffiliation, roles } = usePermissions();
  const portalUrl = (window.location.hostname === 'ipl-finder.localtest.me' || window.location.hostname === 'ipl-finder.lvh.me')
    ? 'http://portal.localtest.me:5173'
    : (import.meta.env.VITE_PORTAL_URL || 'https://portal.veryresto.com');

  const getUserTags = (context: 'header' | 'dropdown') => {
    const tags: React.ReactNode[] = [];

    // 1. Classification Tag
    if (participantType === 'resident') {
      const isOwner = residentSubtype === 'owner';
      const label = isOwner ? 'Resident (Owner)' : 'Resident (Renter)';
      const colorClass = isOwner
        ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      tags.push(
        <Badge key="resident-type" variant="outline" className={`text-[9px] font-semibold px-1.5 py-0.5 h-4.5 ${colorClass}`}>
          {label}
        </Badge>
      );
    } else if (participantType === 'non_resident') {
      const affiliation = requestedAffiliation || 'Staff';
      const formattedAffiliation = affiliation.charAt(0).toUpperCase() + affiliation.slice(1);
      tags.push(
        <Badge key="non-resident-type" variant="outline" className="text-[9px] font-semibold px-1.5 py-0.5 h-4.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
          Non-Resident ({formattedAffiliation})
        </Badge>
      );
    }

    // 2. Global Role Tags
    if (roles && Array.isArray(roles)) {
      roles.forEach((role) => {
        if (role === 'admin') {
          tags.push(
            <Badge key="role-admin" variant="outline" className="text-[9px] font-semibold px-1.5 py-0.5 h-4.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
              Global Admin
            </Badge>
          );
        } else if (role === 'resident_verifier') {
          tags.push(
            <Badge key="role-verifier" variant="outline" className="text-[9px] font-semibold px-1.5 py-0.5 h-4.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
              Verifier
            </Badge>
          );
        } else if (role === 'platform_moderator') {
          tags.push(
            <Badge key="role-moderator" variant="outline" className="text-[9px] font-semibold px-1.5 py-0.5 h-4.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">
              Moderator
            </Badge>
          );
        }
      });
    }

    return tags;
  };


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
          <Button variant="outline" size="sm" asChild className="gap-2 relative">
            <a href={portalUrl} target="_blank" rel="noopener noreferrer">
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Portal</span>
            </a>
          </Button>

          {canUpload && (
            <Button onClick={onUploadClick} size="sm" className="gap-2">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          )}

          {/* Header Tags (Scalable list visible near the avatar) */}
          <div className="hidden md:flex items-center gap-1.5 mr-1">
            {getUserTags('header')}
          </div>

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
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={user?.user_metadata?.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(user?.user_metadata?.full_name, user?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col space-y-0.5 min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{user?.user_metadata?.full_name || "User"}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">{user?.email}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {getUserTags('dropdown')}
                  </div>
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
