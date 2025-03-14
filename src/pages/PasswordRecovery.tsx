
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// Define form schema with Zod
const passwordSchema = z.object({
  password: z.string().min(6, { message: 'Password must be at least 6 characters long' }),
  confirmPassword: z.string().min(6, { message: 'Password must be at least 6 characters long' }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function PasswordRecovery() {
  const [loading, setLoading] = useState(false);
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  // Check for recovery token from multiple sources
  useEffect(() => {
    console.log("Checking for recovery token...");
    
    // Function to handle recovery detection
    const handleRecoveryDetected = () => {
      console.log("Recovery flow detected");
      setIsRecoveryFlow(true);
      toast({
        title: "Password Reset",
        description: "Please enter your new password.",
      });
    };
    
    // 1. First check current URL parameters directly
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    const type = url.searchParams.get('type');
    
    if (type === 'recovery' && token) {
      console.log("Recovery token found in URL parameters");
      handleRecoveryDetected();
      return;
    }
    
    // 2. Check if we have state passed from Auth.tsx or AuthProvider
    if (location.state?.type === 'recovery' && location.state?.token) {
      console.log("Recovery token found in location state");
      handleRecoveryDetected();
      return;
    }
    
    // 3. Check for hash parameters (Supabase sometimes uses hash)
    const hash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);
    if (hashParams.get('type') === 'recovery') {
      console.log("Recovery flow detected from hash");
      handleRecoveryDetected();
      return;
    }
    
    // 4. Check if we're in the auth flow with a recovery action
    const accessToken = url.searchParams.get('access_token');
    if (accessToken) {
      console.log("Access token found, checking if it's a recovery flow");
      handleRecoveryDetected();
      return;
    }
    
    // If no recovery parameters found, show the request reset email form
    console.log("No recovery parameters found, showing email form");
    setIsRecoveryFlow(false);
  }, [location, toast]);

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

  const onSubmit = async (data: PasswordFormValues) => {
    if (data.password !== data.confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
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
      toast({
        title: "Password Updated",
        description: "Your password has been successfully updated. You can now sign in.",
      });
      
      // Sign out after password reset to ensure clean authentication state
      await supabase.auth.signOut();
      
      // Redirect to auth page
      navigate('/auth', { replace: true });
    }
    setLoading(false);
  };

  // Render the password reset email request form
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

  // Render the new password form with two password fields
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
