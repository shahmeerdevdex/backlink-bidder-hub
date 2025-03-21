
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Github } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, isBanned } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Check URL parameters for email verification and recovery token
  useEffect(() => {
    // Parse the URL to check for recovery token
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    
    // Check for password reset token
    if (type === 'recovery' && token) {
      console.log("Recovery link detected with token, redirecting to password recovery page");
      
      // Store the token in localStorage before redirecting
      localStorage.setItem('passwordRecoveryToken', token);
      localStorage.setItem('passwordRecoveryActive', 'true');
      
      // Navigate to password recovery page immediately
      window.location.href = '/password-recovery';
      return;
    }
    
    // Check for email verification success
    if (type === 'signup') {
      toast({
        title: "Email Verified",
        description: "Your email has been verified. You can now sign in.",
      });
    }
  }, [toast, navigate, searchParams]);

  // Check for passwordRecoveryActive and reload if needed
  useEffect(() => {
    if (localStorage.getItem('passwordRecoveryActive') === 'true' && window.location.pathname !== '/password-recovery') {
      window.location.href = '/password-recovery';
    }
  }, []);

  // Redirect authenticated users
  useEffect(() => {
    if (user && !isBanned) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [user, isBanned, navigate, location]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
      }
    });

    if (error) {
      toast({
        title: "Error signing up",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success!",
        description: "Please check your email to confirm your account. Don't forget to check your spam folder.",
      });
      setActiveTab('signin');
    }
    setLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        title: "Error signing in",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleGithubLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth`,
      }
    });

    if (error) {
      toast({
        title: "Error signing in with GitHub",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Show banned user message
  if (isBanned) {
    return (
      <div className="container max-w-md mx-auto px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Account Banned</CardTitle>
            <CardDescription>Your account has been banned.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center mb-4">
              Your account has been banned. Please contact support for more information.
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate('/')}
            >
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-md mx-auto px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Auction App</CardTitle>
          <CardDescription>Sign in to start bidding on auctions</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
                <div className="text-center mt-2">
                  <Button 
                    variant="link" 
                    type="button" 
                    onClick={() => navigate('/password-recovery')}
                    className="text-sm text-muted-foreground"
                  >
                    Forgot your password?
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing up...' : 'Sign Up'}
                </Button>
                <div className="text-center mt-2">
                  <p className="text-xs text-muted-foreground">
                    By signing up, you will need to verify your email before you can sign in.
                  </p>
                </div>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleGithubLogin}>
            <Github className="mr-2 h-4 w-4" />
            GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
