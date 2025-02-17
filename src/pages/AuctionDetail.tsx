
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/components/AuthProvider';
import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface Auction {
  id: string;
  title: string;
  description: string;
  starting_price: number;
  current_price: number;
  max_spots: number;
  filled_spots: number;
  ends_at: string;
  creator_id: string;
}

export default function AuctionDetail() {
  const { id } = useParams();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [newBidAmount, setNewBidAmount] = useState('');
  const [showBids, setShowBids] = useState(false);
  const [bids, setBids] = useState<any[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchAuction();
    fetchBids();

    const channel = supabase
      .channel('any')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${id}` },
        (payload) => {
          console.log('Change received!', payload)
          fetchAuction();
          fetchBids();
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id]);

  const fetchAuction = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      toast({
        title: "Error fetching auction",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setAuction(data || null);
  };

  const fetchBids = async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from('bids')
      .select('*, profiles(username)')
      .eq('auction_id', id)
      .order('amount', { ascending: false });

    if (error) {
      console.error('Error fetching bids:', error);
      return;
    }

    setBids(data || []);
  };

  const handlePlaceBid = async () => {
    if (!user || !auction) return;

    const bidAmount = parseInt(newBidAmount);
    if (isNaN(bidAmount)) {
      toast({
        title: "Invalid bid amount",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }

    if (bidAmount <= (auction.current_price || auction.starting_price)) {
      toast({
        title: "Bid too low",
        description: "Your bid must be higher than the current price",
        variant: "destructive",
      });
      return;
    }

    // First, insert the new bid
    const { data: newBid, error: bidError } = await supabase
      .from('bids')
      .insert([{
        auction_id: id,
        user_id: user.id,
        amount: bidAmount,
        status: 'active'
      }])
      .select()
      .single();

    if (bidError) {
      toast({
        title: "Error placing bid",
        description: bidError.message,
        variant: "destructive",
      });
      return;
    }

    // Immediately update the auction's current price
    const { error: updateError } = await supabase
      .from('auctions')
      .update({ 
        current_price: bidAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating auction price:', updateError);
    }

    // Clear the bid input
    setNewBidAmount('');

    toast({
      title: "Bid placed successfully",
      description: `Your bid of $${bidAmount} has been placed.`,
    });
  };

  const handlePayment = async () => {
    if (!user || !auction) return;
    
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auctionId: auction.id,
          userId: user.id,
          amount: auction.current_price,
        }),
      });

      const session = await response.json();
      if (session.url) {
        window.location.href = session.url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: "Error",
        description: "Could not process payment. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!auction) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>Loading auction details...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">{auction.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{auction.description}</p>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Starting Price</span>
              <span className="font-semibold">${auction.starting_price}</span>
            </div>
            <div className="flex justify-between">
              <span>Current Price</span>
              <span className="font-semibold">${auction.current_price}</span>
            </div>
            <div className="flex justify-between">
              <span>Spots</span>
              <span className="font-semibold">{auction.filled_spots}/{auction.max_spots}</span>
            </div>
            <div className="flex justify-between">
              <span>Ends At</span>
              <span className="font-semibold">
                {format(new Date(auction.ends_at), 'PPp')}
              </span>
            </div>
          </div>
          {user ? (
            <div className="space-y-2">
              <Input
                type="number"
                placeholder="Enter your bid amount"
                value={newBidAmount}
                onChange={(e) => setNewBidAmount(e.target.value)}
              />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handlePlaceBid}>
                  Place Bid
                </Button>
                <Button className="flex-1" onClick={handlePayment} variant="secondary">
                  Pay Now
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground">
              Please <Button variant="link" onClick={() => navigate('/login')}>login</Button> to place a bid.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Sheet open={showBids} onOpenChange={setShowBids}>
            <SheetTrigger asChild>
              <Button className="w-full" variant="outline">
                View All Bids
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[400px] sm:w-[540px]">
              <SheetHeader>
                <SheetTitle>Auction Bids</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                {bids.map((bid) => (
                  <div key={bid.id} className="flex justify-between items-center py-2 border-b">
                    <span>{bid.profiles?.username || 'Anonymous'}</span>
                    <span className="font-semibold">${bid.amount}</span>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </CardFooter>
      </Card>
    </div>
  );
}
