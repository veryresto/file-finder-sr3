import { createContext, useContext, ReactNode } from 'react';
import {
  useUser,
  useAuth as useClerkAuth,
  useClerk,
} from '@clerk/clerk-react';

// Shape kept compatible with previous Supabase-based AuthContext
// so all call sites need minimal rewiring.
interface AuthContextType {
  /** Clerk User object (or null if signed out) */
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  } | null;
  loading: boolean;
  /** Returns a short-lived Clerk JWT to attach to Edge Function requests */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded } = useUser();
  const { getToken: clerkGetToken } = useClerkAuth();
  const clerk = useClerk();

  const user = clerkUser
    ? {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
        fullName: clerkUser.fullName ?? null,
        avatarUrl: clerkUser.imageUrl ?? null,
      }
    : null;

  const getToken = async (): Promise<string | null> => {
    return clerkGetToken();
  };

  const signOut = async (): Promise<void> => {
    await clerk.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: !isLoaded,
        getToken,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
