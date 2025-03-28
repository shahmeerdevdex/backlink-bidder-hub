
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { user, loading, isAdmin, isEmailVerified, isBanned } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showVerificationDialog, setShowVerificationDialog] = useState(!isEmailVerified);
  const [resendingEmail, setResendingEmail] = useState(false);
  const { toast } = useToast();

  const handleResendVerification = async () => {
    if (!user?.email) return;
    
    setResendingEmail(true);
    const { error, data } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
    });
    
    setResendingEmail(false);
    
    if (error) {
      console.error('Error resending verification email:', error);
      toast({
        title: "Error",
        description: "Failed to resend verification email. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email Sent",
        description: "Verification email has been resent. Please check your inbox and spam folder.",
      });
    }
  };

  const handleBackToLogin = () => {
    navigate('/auth', { replace: true });
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    // Save the attempted URL to redirect back after login
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (isBanned) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-md mx-auto p-6 bg-destructive/10 rounded-lg border border-destructive">
          <h1 className="text-2xl font-bold text-destructive mb-4">Account Banned</h1>
          <p className="mb-6">Your account has been banned. Please contact support for more information.</p>
          <Button variant="outline" onClick={() => navigate('/')}>
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  if (!isEmailVerified) {
    // Show verification dialog instead of redirecting
    return (
      <>
        <AlertDialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Email Verification Required</AlertDialogTitle>
              <AlertDialogDescription>
                Please verify your email address before accessing this page. Check your inbox and spam folder for a verification link.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button 
                variant="outline" 
                onClick={handleResendVerification}
                disabled={resendingEmail}
              >
                {resendingEmail ? 'Sending...' : 'Resend Verification Email'}
              </Button>
              <AlertDialogAction asChild>
                <Button onClick={handleBackToLogin}>
                  Back to Login
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (adminOnly && !isAdmin) {
    toast({
      title: "Access Denied",
      description: "Only administrators can access this page.",
      variant: "destructive",
    });
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
