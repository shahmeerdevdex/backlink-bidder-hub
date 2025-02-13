
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Clock, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Auction {
  id: string;
  title: string;
  description: string;
  starting_price: number;
  current_price: number;
  max_spots: number;
  filled_spots: number;
  ends_at: string;
}

interface Bid {
  id: string;
  amount: number;
  created_at: string;
  user_id: string;
  status: string;
}

export default function AuctionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    const fetchAuction = async () => {
      const { data, error } = await supabase
        .from('auctions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching auction:', error);
        return;
      }

      setAuction(data);
    };

    const fetchBids = async () => {
      const { data, error } = await supabase
        .from('bids')
        .select('*')
        .eq('auction_id', id)
        .order('amount', { ascending: false });

      if (error) {
        console.error('Error fetching bids:', error);
        return;
      }

      setBids(data || []);
    };

    fetchAuction();
    fetchBids();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('realtime-updates')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${id}` },
        fetchAuction
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bids', filter: `auction_id=eq.${id}` },
        fetchBids
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (!auction) return;

    const updateTimeLeft = () => {
      const end = new Date(auction.ends_at);
      if (end > new Date()) {
        setTimeLeft(formatDistanceToNow(end, { addSuffix: true }));
      } else {
        setTimeLeft('Ended');
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 60000);

    return () => clearInterval(interval);
  }, [auction]);

  const handleBid = async () => {
    if (!auction) return;

    const amount = parseInt(bidAmount);
    if (isNaN(amount) || amount <= auction.current_price) {
      toast({
        title: "Invalid bid amount",
        description: "Bid must be higher than the current price",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from('bids')
      .insert([
        {
          auction_id: auction.id,
          amount: amount,
          status: 'active'
        }
      ])
      .select()
      .single();

    if (error) {
      toast({
        title: "Error placing bid",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setBidAmount('');
    toast({
      title: "Bid placed successfully",
      description: "Proceed to payment to secure your bid",
    });

    // Redirect to payment page
    navigate(`/payment/${data.id}`);
  };

  if (!auction) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-start mb-4">
            <CardTitle className="text-3xl font-bold">{auction.title}</CardTitle>
            <Badge variant={auction.filled_spots >= auction.max_spots ? "destructive" : "secondary"}>
              <Users className="w-4 h-4 mr-1" />
              {auction.filled_spots}/{auction.max_spots} spots
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{timeLeft}</span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-lg mb-6">{auction.description}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Auction Details</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Starting Price</span>
                  <span className="font-semibold">${auction.starting_price}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Highest Bid</span>
                  <span className="font-semibold">${auction.current_price}</span>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex gap-4">
                  <Input
                    type="number"
                    placeholder="Enter bid amount"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    min={auction.current_price + 1}
                  />
                  <Button 
                    onClick={handleBid}
                    disabled={auction.filled_spots >= auction.max_spots}
                  >
                    Place Bid
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Bid History</h3>
              <div className="space-y-2">
                {bids.map((bid) => (
                  <div key={bid.id} className="flex justify-between items-center p-2 bg-secondary/10 rounded">
                    <span>${bid.amount}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(bid.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
                {bids.length === 0 && (
                  <p className="text-muted-foreground">No bids yet</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
