
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isEmailVerified: boolean;
  isBanned: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  isEmailVerified: false,
  isBanned: false,
  signOut: async () => {},
  refreshSession: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const { toast } = useToast();

  const refreshSession = async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (data.session) {
      setUser(data.session.user);
      setIsEmailVerified(!!data.session.user.email_confirmed_at);
      if (data.session.user) {
        checkUserStatus(data.session.user.id);
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsEmailVerified(!!session.user.email_confirmed_at);
        checkUserStatus(session.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session) => {
      console.log("Auth state change:", event);
      handleAuthChange(event, session?.user);
      
      // Check if we're in a password recovery flow using URL parameters
      const url = new URL(window.location.href);
      const isPasswordRecovery = 
        url.searchParams.has('token') || 
        new URLSearchParams(window.location.hash.substring(1)).has('token') ||
        url.hash.includes('token=') ||
        localStorage.getItem('passwordRecoveryActive') === 'true';
      
      // Don't update user state during password recovery to prevent sign-out
      if (!isPasswordRecovery) {
        setUser(session?.user ?? null);
        if (session?.user) {
          setIsEmailVerified(!!session.user.email_confirmed_at);
          checkUserStatus(session.user.id);
        } else {
          setIsAdmin(false);
          setIsEmailVerified(false);
          setIsBanned(false);
        }
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserStatus = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin, is_banned')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setIsAdmin(data.is_admin);
      setIsBanned(data.is_banned);
      
      // If the user is banned, sign them out and show a notification
      if (data.is_banned) {
        toast({
          title: "Account Banned",
          description: "Your account has been banned. Please contact support for more information.",
          variant: "destructive",
        });
        
        // Force sign out after showing the toast
        setTimeout(() => {
          signOut();
        }, 2000);
      }
    }
  };

  const handleAuthChange = (event: AuthChangeEvent, user: User | null) => {
    // Check if we're in a password recovery flow using the URL or local storage
    const url = new URL(window.location.href);
    const isPasswordRecovery = 
      url.searchParams.has('token') || 
      new URLSearchParams(window.location.hash.substring(1)).has('token') ||
      url.hash.includes('token=');
    
    if (isPasswordRecovery) {
      console.log("Password recovery event detected");
      toast({
        title: "Password Recovery",
        description: "You can now reset your password.",
      });
      
      // Extract token from all possible places in the URL
      const token = url.searchParams.get('token') || 
                    new URLSearchParams(window.location.hash.substring(1)).get('token') ||
                    url.hash.match(/token=([^&]*)/)?.[1];
      
      console.log("Found recovery token:", token ? "yes" : "no");
      
      if (token) {
        localStorage.setItem('passwordRecoveryToken', token);
        console.log("Stored recovery token in localStorage");
      }
      
      // Always set the recovery state to true when this event is triggered
      localStorage.setItem('passwordRecoveryActive', 'true');
      console.log("Set passwordRecoveryActive to true in localStorage");
      
      // Force reload the page after setting localStorage
      if (window.location.pathname !== '/password-recovery') {
        console.log("Redirecting to password recovery page");
        window.location.href = '/password-recovery';
      } else {
        // If already on the password recovery page, reload to apply the changes
        console.log("Already on password recovery page, reloading");
        window.location.reload();
      }
      
      // Important: Don't sign out the user if they're already logged in
    } else if (event === 'SIGNED_IN') {
      if (user && !user.email_confirmed_at) {
        toast({
          title: "Email Not Verified",
          description: "Please check your email to verify your account.",
          variant: "destructive",
        });
      } else if (user) {
        toast({
          title: "Welcome Back",
          description: `Signed in as ${user.email}`,
        });
      }
    } else if (event === 'SIGNED_OUT') {
      toast({
        title: "Signed Out",
        description: "You have been signed out.",
      });
      // Only clear recovery state if explicitly signing out
      // Not during password recovery process
      if (localStorage.getItem('passwordRecoveryActive') !== 'true') {
        localStorage.removeItem('passwordRecoveryActive');
        localStorage.removeItem('passwordRecoveryToken');
      }
    } else if (event === 'USER_UPDATED') {
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
    }
  };

  const signOut = async () => {
    try {
      console.log("Signing out...");
      
      // Don't clear recovery state if in password recovery mode
      const inRecoveryMode = localStorage.getItem('passwordRecoveryActive') === 'true';
      if (!inRecoveryMode) {
        localStorage.removeItem('passwordRecoveryActive');
        localStorage.removeItem('passwordRecoveryToken');
      }
      
      // Perform the sign out
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error("Sign out error:", error);
        toast({
          title: "Sign Out Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        console.log("Sign out successful");
        
        // Force refresh the page to ensure auth state is completely reset
        window.location.href = '/';
      }
    } catch (err) {
      console.error("Unexpected error during sign out:", err);
      toast({
        title: "Sign Out Failed",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isEmailVerified, isBanned, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};
