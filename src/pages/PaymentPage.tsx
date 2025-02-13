
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

interface Bid {
  id: string;
  amount: number;
  auction_id: string;
  status: string;
}

interface Auction {
  id: string;
  title: string;
  description: string;
}

export default function PaymentPage() {
  const { bidId } = useParams();
  const [bid, setBid] = useState<Bid | null>(null);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBidDetails();
  }, [bidId]);

  const fetchBidDetails = async () => {
    if (!bidId) return;

    const { data: bidData, error: bidError } = await supabase
      .from('bids')
      .select('*, auctions(*)')
      .eq('id', bidId)
      .single();

    if (bidError) {
      toast({
        title: "Error fetching bid details",
        description: bidError.message,
        variant: "destructive",
      });
      navigate('/');
      return;
    }

    if (bidData) {
      setBid({
        id: bidData.id,
        amount: bidData.amount,
        auction_id: bidData.auction_id,
        status: bidData.status,
      });
      setAuction({
        id: bidData.auctions.id,
        title: bidData.auctions.title,
        description: bidData.auctions.description,
      });
    }
    setLoading(false);
  };

  const handlePayment = async () => {
    if (!bid) return;

    // Here we'll integrate with Stripe Checkout
    // For now, we'll just create a payment record
    const { error: paymentError } = await supabase
      .from('payments')
      .insert([
        {
          bid_id: bid.id,
          amount: bid.amount,
          status: 'pending'
        }
      ]);

    if (paymentError) {
      toast({
        title: "Error creating payment",
        description: paymentError.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Payment initiated",
      description: "You will be redirected to complete the payment",
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!bid || !auction) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Bid not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Complete Your Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">Auction Details</h3>
            <p className="text-muted-foreground">{auction.title}</p>
            <p className="text-sm text-muted-foreground">{auction.description}</p>
          </div>
          <div>
            <h3 className="font-semibold">Bid Amount</h3>
            <p className="text-2xl font-bold">${bid.amount}</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            className="w-full" 
            onClick={handlePayment}
            disabled={bid.status !== 'active'}
          >
            Pay ${bid.amount}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
