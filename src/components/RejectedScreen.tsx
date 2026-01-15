import { XCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function RejectedScreen() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="h-8 w-8 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Access Denied</h1>
          <p className="text-muted-foreground">
            Hello{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}
          </p>
        </div>

        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-6 space-y-3">
          <p className="text-sm text-foreground">
            Your account access has been rejected by an administrator.
          </p>
          <p className="text-sm text-muted-foreground">
            If you believe this is a mistake, please contact the administrator for assistance.
          </p>
        </div>

        <Button variant="outline" onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
