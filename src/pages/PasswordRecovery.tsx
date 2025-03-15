
import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/AuthProvider';

interface PasswordFormValues {
  password: string;
  confirmPassword: string;
}

export default function PasswordRecovery() {
  const [loading, setLoading] = useState(false);
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [tokenChecked, setTokenChecked] = useState(false);
  const { user, signOut } = useAuth();

  const form = useForm<PasswordFormValues>({
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    const storedActive = localStorage.getItem('passwordRecoveryActive');
    const queryToken = searchParams.get('token');
    const queryType = searchParams.get('type');
    
    if (user && (storedActive === 'true' || (queryToken && queryType === 'recovery'))) {
      console.log("User is signed in but needs password recovery. Signing out first...");
      const performSignOut = async () => {
        await signOut();
        setTokenChecked(false);
      };
      performSignOut();
    }
  }, [user, searchParams, signOut]);

  useEffect(() => {
    if (tokenChecked) return;
    
    console.log("Checking for recovery token...");
    
    const storedActive = localStorage.getItem('passwordRecoveryActive');
    if (storedActive === 'true') {
      console.log("Found passwordRecoveryActive=true in localStorage");
      setIsRecoveryFlow(true);
      setTokenChecked(true);
      return;
    }
    
    const queryToken = searchParams.get('token');
    const queryType = searchParams.get('type');
    const locationToken = location.state?.token;
    const locationType = location.state?.type;
    const hashToken = new URLSearchParams(window.location.hash.substring(1)).get('token');
    const hashType = new URLSearchParams(window.location.hash.substring(1)).get('type');
    const storedToken = localStorage.getItem('passwordRecoveryToken');
    
    console.log("Query token:", queryToken ? "found" : "not found");
    console.log("Location token:", locationToken ? "found" : "not found");
    console.log("Hash token:", hashToken ? "found" : "not found");
    console.log("Stored token:", storedToken ? "found" : "not found");
    
    const token = queryToken || locationToken || hashToken || storedToken;
    const type = queryType || locationType || hashType;

    if (token) {
      console.log("Found token, storing in localStorage");
      localStorage.setItem('passwordRecoveryToken', token);
      localStorage.setItem('passwordRecoveryActive', 'true');
      setIsRecoveryFlow(true);
      
      toast({
        title: "Password Reset",
        description: "Please enter your new password.",
      });
    } else {
      console.log("No recovery parameters found, showing email form");
      setIsRecoveryFlow(false);
    }
    
    setTokenChecked(true);
  }, [location, toast, searchParams, tokenChecked]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/password-recovery`,
    });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Recovery Email Sent",
        description: "Check your email for the password reset link.",
      });
    }
    setLoading(false);
  };

  const validatePasswords = (password: string, confirmPassword: string) => {
    const errors: Partial<PasswordFormValues> = {};
    
    if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters long';
    }
    
    if (confirmPassword.length < 6) {
      errors.confirmPassword = 'Password must be at least 6 characters long';
    }
    
    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords don't match";
    }
    
    return errors;
  };

  const onSubmit = async (data: PasswordFormValues) => {
    const errors = validatePasswords(data.password, data.confirmPassword);
    
    if (errors.password || errors.confirmPassword) {
      if (errors.password) {
        form.setError('password', { 
          type: 'manual', 
          message: errors.password 
        });
      }
      
      if (errors.confirmPassword) {
        form.setError('confirmPassword', { 
          type: 'manual', 
          message: errors.confirmPassword
        });
      }
      
      return;
    }

    setLoading(true);
    
    const { error } = await supabase.auth.updateUser({
      password: data.password,
    });

    if (error) {
      toast({
        title: "Error updating password",
        description: error.message,
        variant: "destructive",
      });
    } else {
      localStorage.removeItem('passwordRecoveryActive');
      localStorage.removeItem('passwordRecoveryToken');
      
      toast({
        title: "Password Updated",
        description: "Your password has been successfully updated. You can now sign in.",
      });
      
      await supabase.auth.signOut();
      
      navigate('/auth', { replace: true });
    }
    setLoading(false);
  };

  const renderRequestResetForm = () => {
    return (
      <div className="space-y-4">
        <div className="text-center mb-4">
          <h2 className="text-xl font-semibold">Reset Your Password</h2>
          <p className="text-sm text-muted-foreground">Enter your email to receive a password reset link</p>
        </div>
        <form onSubmit={handlePasswordReset} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </Button>
          <div className="text-center">
            <Button variant="link" onClick={() => navigate('/auth')}>
              Back to Sign In
            </Button>
          </div>
        </form>
      </div>
    );
  };

  const renderNewPasswordForm = () => {
    return (
      <div className="space-y-4">
        <div className="text-center mb-4">
          <h2 className="text-xl font-semibold">Reset Your Password</h2>
          <p className="text-sm text-muted-foreground">Enter your new password below</p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        placeholder="Enter your new password"
                        type={showPassword ? "text" : "password"}
                        {...field}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        placeholder="Confirm your new password"
                        type={showConfirmPassword ? "text" : "password"}
                        {...field}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </Form>
      </div>
    );
  };

  return (
    <div className="container max-w-md mx-auto px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Password Recovery</CardTitle>
          <CardDescription>
            {isRecoveryFlow 
              ? "Create a new password" 
              : "Request a password reset link"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isRecoveryFlow 
            ? renderNewPasswordForm() 
            : renderRequestResetForm()}
        </CardContent>
      </Card>
    </div>
  );
}
