import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Clock, CreditCard, Users, X, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/components/AuthProvider';

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

interface AuctionWinner {
  id: string;
  user_id: string;
  status: string;
  winning_bid_id: string;
}

export default function AuctionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<string>('');
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [topBidders, setTopBidders] = useState<Set<string>>(new Set());
  const [emailsSent, setEmailsSent] = useState<boolean>(false);
  const [isSendingEmails, setIsSendingEmails] = useState<boolean>(false);
  const [userWinner, setUserWinner] = useState<AuctionWinner | null>(null);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user?.id || null);
    };
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    const updateTopBidders = () => {
      const uniqueBidders = new Set<string>();
      const activeBids = bids.filter(bid => bid.status === 'active')
        .sort((a, b) => b.amount - a.amount);
      
      for (const bid of activeBids) {
        if (uniqueBidders.size < (auction?.max_spots || 3)) {
          uniqueBidders.add(bid.user_id);
        } else {
          break;
        }
      }
      setTopBidders(uniqueBidders);
    };
    updateTopBidders();
  }, [bids, auction?.max_spots]);

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
      setEmailsSent(data.winners_processed || false);
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

    const fetchUserWinnerStatus = async () => {
      if (!user || !id) return;
      
      const { data, error } = await supabase
        .from('auction_winners')
        .select('*')
        .eq('auction_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
        
      if (error) {
        console.error('Error fetching winner status:', error);
        return;
      }
      
      if (data) {
        console.log('User is a winner for this auction:', data);
        setUserWinner(data);
      }
    };

    fetchAuction();
    fetchBids();
    if (user) {
      fetchUserWinnerStatus();
    }

    const auctionChannel = supabase
      .channel('auction-detail-updates')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${id}` },
        async (payload) => {
          console.log('Auction detail update received:', payload);
          if (payload.new) {
            setAuction(payload.new as Auction);
          }
        }
      )
      .subscribe();

    const bidsChannel = supabase
      .channel('bids-detail-updates')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bids', filter: `auction_id=eq.${id}` },
        async () => {
          console.log('Bid update received, fetching latest bids');
          const { data } = await supabase
            .from('bids')
            .select('*')
            .eq('auction_id', id)
            .order('amount', { ascending: false });

          if (data) {
            console.log('Updated bids:', data);
            setBids(data);
            
            const highestBid = data.find(bid => bid.status === 'active');
            if (highestBid && auction) {
              setAuction({
                ...auction,
                current_price: highestBid.amount
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(auctionChannel);
      supabase.removeChannel(bidsChannel);
    };
  }, [id, user]);

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

  useEffect(() => {
    if (auction && 
        new Date(auction.ends_at) <= new Date() && 
        topBidders.size > 0 && 
        !emailsSent && 
        !isSendingEmails) {
      
      const sendWinnerEmails = async () => {
        setIsSendingEmails(true);
        
        try {
          console.log('Calling send-winner-email function for auction:', auction.id);
          
          const { data, error } = await supabase.functions.invoke('send-winner-email', {
            body: { auctionId: auction.id }
          });

          if (error) {
            console.error('Error sending winner emails:', error);
            toast({
              title: "Error sending winner emails",
              description: error.message || "Please try again later",
              variant: "destructive"
            });
            return;
          }

          console.log('Winner emails response:', data);
          setEmailsSent(true);
          
          if (data.successCount > 0) {
            toast({
              title: "Winner emails sent",
              description: `${data.successCount} email notifications have been sent to auction winners`
            });
          } else {
            toast({
              title: "No emails sent",
              description: "No eligible winners found or all emails failed to send",
              variant: "destructive"
            });
          }
          
          setAuction(prev => prev ? {...prev, winners_processed: true} : null);
          
        } catch (error) {
          console.error('Error invoking send-winner-email function:', error);
          toast({
            title: "Error sending winner emails",
            description: "An unexpected error occurred",
            variant: "destructive"
          });
        } finally {
          setIsSendingEmails(false);
        }
      };

      sendWinnerEmails();
    }
  }, [auction, topBidders, emailsSent, toast, isSendingEmails]);

  const handleBid = async () => {
    if (!auction || !currentUser) {
      toast({
        title: "Error",
        description: "You must be logged in to place a bid",
        variant: "destructive",
      });
      return;
    }

    const amount = parseInt(bidAmount);
    if (isNaN(amount) || amount <= auction.current_price) {
      toast({
        title: "Invalid bid amount",
        description: "Bid must be higher than the current price",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('bids')
        .insert([
          {
            auction_id: auction.id,
            amount: amount,
            status: 'active',
            user_id: currentUser
          }
        ])
        .select()
        .single();

      if (error) {
        if (error.message.includes('Maximum number of spots reached')) {
          toast({
            title: "Cannot place bid",
            description: "This auction has reached its maximum number of participants",
            variant: "destructive",
          });
          return;
        }

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
        description: "Your bid has been recorded",
      });
    } catch (error) {
      console.error('Error placing bid:', error);
      toast({
        title: "Error placing bid",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const handleCancelBid = async (bidId: string) => {
    const { error } = await supabase
      .from('bids')
      .update({ status: 'cancelled' })
      .eq('id', bidId)
      .eq('user_id', currentUser);

    if (error) {
      toast({
        title: "Error cancelling bid",
        description: "Could not cancel your bid at this time",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Bid cancelled",
      description: "Your bid has been cancelled successfully",
    });
  };

  const handlePayment = async () => {
    if (!userWinner) return;
    
    const winningBid = userWinner.winning_bid_id;
    navigate(`/payment/${winningBid}`);
  };

  if (!auction) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  const isAuctionEnded = new Date(auction.ends_at) <= new Date();
  const isUserEligibleToPay = userWinner && (userWinner.status === 'pending_payment');

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-start mb-4">
            <CardTitle className="text-3xl font-bold">{auction.title}</CardTitle>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={auction.filled_spots >= auction.max_spots ? "destructive" : "secondary"}>
                <Users className="w-4 h-4 mr-1" />
                {auction.filled_spots}/{auction.max_spots} spots
              </Badge>
              
              {isAuctionEnded && (
                <Badge variant={emailsSent ? "default" : "outline"}>
                  {emailsSent ? "Emails sent" : "Emails pending"}
                </Badge>
              )}
              
              {isUserEligibleToPay && (
                <Badge variant="default" className="bg-green-500">
                  You won this auction!
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{timeLeft}</span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-lg mb-6">{auction.description}</p>

          {isUserEligibleToPay && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-xl font-semibold text-green-700 mb-2">Congratulations on winning this auction!</h3>
              <p className="mb-4">Please complete your payment to claim your winnings.</p>
              <Button 
                onClick={handlePayment}
                className="bg-green-600 hover:bg-green-700"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Pay Now
              </Button>
            </div>
          )}

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

              {!isAuctionEnded && (
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
                      disabled={auction.filled_spots >= auction.max_spots || !currentUser}
                    >
                      Place Bid
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Bid History</h3>
              <div className="space-y-2">
                {bids.map((bid) => {
                  const isUserInTopSpots = topBidders.has(bid.user_id);
                  const isCurrentUserBid = bid.user_id === currentUser;
                  const bidStyle = isCurrentUserBid ? 
                    (isUserInTopSpots ? "bg-green-100" : "bg-red-100") : 
                    "bg-secondary/10";
                  return (
                    <div key={bid.id} className={`flex justify-between items-center p-2 rounded ${bidStyle}`}>
                      <div className="flex items-center gap-2">
                        {isCurrentUserBid && (
                          isUserInTopSpots ? 
                            <CheckCircle className="w-4 h-4 text-green-600" /> :
                            <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className={bid.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}>
                          ${bid.amount}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(bid.created_at), { addSuffix: true })}
                        </span>
                        {bid.user_id === currentUser && bid.status === 'active' && !isAuctionEnded && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCancelBid(bid.id)}
                            className="h-8 w-8"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
