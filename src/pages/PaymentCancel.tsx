
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { XCircle } from 'lucide-react';

export default function PaymentCancel() {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Show cancellation toast
    toast({
      title: "Payment Cancelled",
      description: "Your payment has been cancelled.",
      variant: "destructive",
    });
  }, [toast]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <XCircle className="h-12 w-12 text-red-500" />
          </div>
          <CardTitle className="text-center">Payment Cancelled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground">
            Your payment has been cancelled. No charges were made to your account.
          </p>
          <div className="flex justify-center">
            <Button onClick={() => navigate('/dashboard')}>
              Return to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
