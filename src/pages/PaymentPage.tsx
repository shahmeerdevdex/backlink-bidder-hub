
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

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
  const [processingPayment, setProcessingPayment] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (bidId) {
      fetchBidDetails();
    } else if (user) {
      // If no specific bid ID is provided, fetch the highest bid for any won auction
      fetchHighestWinningBid();
    }
  }, [bidId, user]);

  const fetchHighestWinningBid = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // First check if user has any won auctions with pending payment
      const { data: winnerData, error: winnerError } = await supabase
        .from('auction_winners')
        .select(`
          winning_bid_id,
          auction:auctions(id, title, description)
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending_payment')
        .maybeSingle();
      
      if (winnerError) {
        console.error('Error fetching winner data:', winnerError);
        throw winnerError;
      }
      
      if (winnerData && winnerData.winning_bid_id) {
        // If there's a winning bid, fetch its details
        const { data: bidData, error: bidError } = await supabase
          .from('bids')
          .select('*')
          .eq('id', winnerData.winning_bid_id)
          .single();
        
        if (bidError) {
          console.error('Error fetching bid details:', bidError);
          throw bidError;
        }
        
        setBid({
          id: bidData.id,
          amount: bidData.amount,
          auction_id: bidData.auction_id,
          status: bidData.status,
        });
        
        if (winnerData.auction) {
          setAuction({
            id: winnerData.auction.id,
            title: winnerData.auction.title,
            description: winnerData.auction.description,
          });
        }
      } else {
        // If no specific winning bid, find the highest active bid in ended auctions
        const now = new Date().toISOString();
        
        // Get all ended auctions where the user has placed bids
        const { data: endedAuctions, error: auctionsError } = await supabase
          .from('auctions')
          .select('id, title, description')
          .lt('ends_at', now)
          .in('id', supabase.from('bids').select('auction_id').eq('user_id', user.id));
        
        if (auctionsError) {
          console.error('Error fetching ended auctions:', auctionsError);
          throw auctionsError;
        }
        
        if (endedAuctions && endedAuctions.length > 0) {
          // For each ended auction, get the user's highest bid
          for (const auction of endedAuctions) {
            const { data: highestBid, error: bidError } = await supabase
              .from('bids')
              .select('*')
              .eq('user_id', user.id)
              .eq('auction_id', auction.id)
              .eq('status', 'active')
              .order('amount', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (bidError) {
              console.error(`Error fetching highest bid for auction ${auction.id}:`, bidError);
              continue;
            }
            
            if (highestBid) {
              // Check if this user is among the top bidders
              const { data: topBids, error: topBidsError } = await supabase
                .from('bids')
                .select('id, amount, user_id')
                .eq('auction_id', auction.id)
                .eq('status', 'active')
                .order('amount', { ascending: false })
                .limit(auction.max_spots || 3);
              
              if (topBidsError) {
                console.error(`Error fetching top bids for auction ${auction.id}:`, topBidsError);
                continue;
              }
              
              const isTopBidder = topBids?.some(bid => bid.user_id === user.id);
              
              if (isTopBidder) {
                setBid({
                  id: highestBid.id,
                  amount: highestBid.amount,
                  auction_id: highestBid.auction_id,
                  status: highestBid.status,
                });
                
                setAuction({
                  id: auction.id,
                  title: auction.title,
                  description: auction.description,
                });
                
                break;
              }
            }
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Error fetching bid information",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
    
    setProcessingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { bidId: bid.id }
      });

      if (error) throw error;
      if (!data.sessionUrl) throw new Error('No checkout URL received');

      // Redirect to Stripe Checkout
      window.location.href = data.sessionUrl;
    } catch (error: any) {
      toast({
        title: "Error initiating payment",
        description: error.message,
        variant: "destructive",
      });
      setProcessingPayment(false);
    }
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
            <p className="text-center text-muted-foreground">No eligible bid found for payment</p>
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
            disabled={bid.status !== 'active' || processingPayment}
          >
            {processingPayment ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting to payment...
              </>
            ) : (
              `Pay $${bid.amount}`
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
