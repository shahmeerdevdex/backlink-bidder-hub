
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isEmailVerified: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  isEmailVerified: false,
  signOut: async () => {},
  refreshSession: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const refreshSession = async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (data.session) {
      setUser(data.session.user);
      setIsEmailVerified(!!data.session.user.email_confirmed_at);
      if (data.session.user) {
        checkAdminStatus(data.session.user.id);
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsEmailVerified(!!session.user.email_confirmed_at);
        checkAdminStatus(session.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session) => {
      console.log("Auth state change:", event);
      handleAuthChange(event, session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsEmailVerified(!!session.user.email_confirmed_at);
        checkAdminStatus(session.user.id);
      } else {
        setIsAdmin(false);
        setIsEmailVerified(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleAuthChange = (event: AuthChangeEvent, session: Session | null) => {
    if (event === 'PASSWORD_RECOVERY') {
      console.log("Password recovery event detected");
      // Explicitly navigate to password-recovery page with recovery token information
      const url = new URL(window.location.href);
      const token = url.searchParams.get('token');
      const type = url.searchParams.get('type');
      const redirectTo = url.searchParams.get('redirect_to');
      
      // Wait a brief moment to ensure navigation happens after other auth processing
      setTimeout(() => {
        navigate('/password-recovery', { 
          replace: true,
          state: { token, type, redirect_to: redirectTo }
        });
      }, 100);
      
      toast({
        title: "Password Recovery",
        description: "You can now reset your password.",
      });
    } else if (event === 'SIGNED_IN') {
      if (session?.user && !session.user.email_confirmed_at) {
        toast({
          title: "Email Not Verified",
          description: "Please check your email to verify your account.",
          variant: "destructive",
        });
      } else if (session?.user) {
        toast({
          title: "Welcome Back",
          description: `Signed in as ${session.user.email}`,
        });
      }
    } else if (event === 'SIGNED_OUT') {
      toast({
        title: "Signed Out",
        description: "You have been signed out.",
      });
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
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isEmailVerified, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};
