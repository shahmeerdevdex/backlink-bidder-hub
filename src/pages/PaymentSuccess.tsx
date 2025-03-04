
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isVerifying, setIsVerifying] = useState(true);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<{
    amount: number;
    auctionTitle?: string;
  } | null>(null);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        setIsVerifying(false);
        return;
      }

      try {
        // Check if payment exists and is completed
        const { data, error } = await supabase
          .from('payments')
          .select(`
            id, 
            status, 
            amount, 
            bid_id,
            bid:bids (
              auction_id,
              auction:auctions (
                title
              )
            )
          `)
          .eq('stripe_session_id', sessionId)
          .maybeSingle();

        if (error) throw error;

        if (data && data.status === 'completed') {
          setPaymentVerified(true);
          setPaymentDetails({
            amount: data.amount,
            auctionTitle: data.bid?.auction?.title
          });
          
          toast({
            title: "Payment Verified",
            description: `Your payment of $${data.amount} has been successfully processed.`,
            variant: "default",
          });
        } else if (data && data.status === 'pending') {
          // If not yet completed, it might still be processing
          toast({
            title: "Payment Processing",
            description: "Your payment is being processed. This may take a moment.",
            variant: "default",
          });
          
          // Payments are usually processed quickly, but we'll check again in a few seconds
          setTimeout(verifyPayment, 5000);
          return;
        } else {
          // If payment not found or has another status
          toast({
            title: "Payment Status Unknown",
            description: "We couldn't verify your payment status. Please check your dashboard later.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error verifying payment:", error);
        toast({
          title: "Verification Error",
          description: "There was an issue verifying your payment, but it may still have been processed.",
          variant: "destructive",
        });
      } finally {
        setIsVerifying(false);
      }
    };

    verifyPayment();
  }, [sessionId, toast]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
          </div>
          <CardTitle className="text-center">Payment Successful!</CardTitle>
          <CardDescription className="text-center">
            Thank you for your payment. Your transaction has been completed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isVerifying ? (
            <div className="flex flex-col items-center justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Verifying payment status...</p>
            </div>
          ) : (
            <>
              {paymentVerified && paymentDetails && (
                <div className="bg-green-50 p-4 rounded-md border border-green-200">
                  <h3 className="font-semibold text-green-800">Payment Details:</h3>
                  <p className="text-green-700">Amount: ${paymentDetails.amount}</p>
                  {paymentDetails.auctionTitle && (
                    <p className="text-green-700">Auction: {paymentDetails.auctionTitle}</p>
                  )}
                </div>
              )}
              <p className="text-center text-muted-foreground">
                You will receive a confirmation email shortly with the details of your purchase.
              </p>
            </>
          )}
          <div className="flex justify-center pt-4">
            <Button onClick={() => navigate('/dashboard')}>
              Return to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
