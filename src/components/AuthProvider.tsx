
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
        checkAdminStatus(data.session.user.id);
        checkBanStatus(data.session.user.id);
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsEmailVerified(!!session.user.email_confirmed_at);
        checkAdminStatus(session.user.id);
        checkBanStatus(session.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session) => {
      console.log("Auth state change:", event);
      handleAuthChange(event, session?.user);

      // Don't update user state during PASSWORD_RECOVERY to prevent sign-out
      if (event === 'PASSWORD_RECOVERY' as AuthChangeEvent) {
        console.log("Password recovery event detected");
        // Don't change the user state
      } else {
        setUser(session?.user ?? null);
        if (session?.user) {
          setIsEmailVerified(!!session.user.email_confirmed_at);
          checkAdminStatus(session.user.id);
          checkBanStatus(session.user.id);
        } else if (event !== 'PASSWORD_RECOVERY' as AuthChangeEvent) {
          // Only reset these states if not in password recovery
          setIsAdmin(false);
          setIsEmailVerified(false);
          setIsBanned(false);
        }
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkBanStatus = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_banned')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setIsBanned(data.is_banned);
      if (data.is_banned) {
        console.log("User is banned - signing out");
        toast({
          title: "Account Banned",
          description: "Your account has been banned. Please contact support for more information.",
          variant: "destructive",
        });
        // Sign out banned users automatically
        signOut();
      }
    }
  };

  const handleAuthChange = (event: AuthChangeEvent, user: User | null) => {
    if (event === 'PASSWORD_RECOVERY') {
      console.log("Password recovery event detected");
      toast({
        title: "Password Recovery",
        description: "You can now reset your password.",
      });

      const url = new URL(window.location.href);
      const token = url.searchParams.get('token') || 
                    new URLSearchParams(window.location.hash.substring(1)).get('token') ||
                    url.hash.match(/token=([^&]*)/)?.[1];

      console.log("Found recovery token:", token ? "yes" : "no");

      if (token) {
        localStorage.setItem('passwordRecoveryToken', token);
        console.log("Stored recovery token in localStorage");
      }

      localStorage.setItem('passwordRecoveryActive', 'true');
      console.log("Set passwordRecoveryActive to true in localStorage");

      if (window.location.pathname !== '/password-recovery') {
        console.log("Redirecting to password recovery page");
        window.location.href = '/password-recovery';
      } else {
        window.location.reload();
      }
    } else if (event === 'SIGNED_IN') {
      if (user && !user.email_confirmed_at && user.app_metadata.provider === 'email') {
        toast({
          title: "Email Not Verified",
          description: "Please check your email to verify your account.",
          variant: "destructive",
        });
      } else if (user) {
        const provider = user.app_metadata.provider;
        let providerName = provider === 'google' ? 'Google' : 
                          provider === 'github' ? 'GitHub' : 'email';
        
        toast({
          title: "Welcome Back",
          description: `Signed in ${provider !== 'email' ? `with ${providerName}` : `as ${user.email}`}`,
        });
      }
    } else if (event === 'SIGNED_OUT') {
      toast({
        title: "Signed Out",
        description: "You have been signed out.",
      });
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

  const checkAdminStatus = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setIsAdmin(data.is_admin);
    }
  };

  const signOut = async () => {
    const inRecoveryMode = localStorage.getItem('passwordRecoveryActive') === 'true';
    if (!inRecoveryMode) {
      localStorage.removeItem('passwordRecoveryActive');
      localStorage.removeItem('passwordRecoveryToken');
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isAdmin, 
      isEmailVerified, 
      isBanned, 
      signOut, 
      refreshSession 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};
