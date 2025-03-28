import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Clock, DollarSign, Users, X, XCircle, Shield, AlertTriangle } from 'lucide-react';
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
  winners_processed: boolean;
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
  const [isAuctionEnded, setIsAuctionEnded] = useState<boolean>(false);
  const [userLostAuction, setUserLostAuction] = useState<boolean>(false);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user?.id || null);
    };
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    const updateTopBidders = () => {
      const userHighestBids = new Map<string, Bid>();

      bids.filter(bid => bid.status === 'active').forEach(bid => {
        if (!userHighestBids.has(bid.user_id) || 
            userHighestBids.get(bid.user_id)!.amount < bid.amount) {
          userHighestBids.set(bid.user_id, bid);
        }
      });
      
      const highestBids = Array.from(userHighestBids.values())
        .sort((a, b) => b.amount - a.amount);
      
      const topN = auction?.max_spots || 3;
      const topBidderIds = new Set<string>();
      
      for (let i = 0; i < Math.min(topN, highestBids.length); i++) {
        topBidderIds.add(highestBids[i].user_id);
      }
      
      setTopBidders(topBidderIds);
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
      
      const endTime = new Date(data.ends_at);
      setIsAuctionEnded(endTime <= new Date());
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
      const now = new Date();
      
      if (end > now) {
        setTimeLeft(formatDistanceToNow(end, { addSuffix: true }));
        setIsAuctionEnded(false);
      } else {
        setTimeLeft('Ended');
        setIsAuctionEnded(true);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 60000);

    return () => clearInterval(interval);
  }, [auction]);

  useEffect(() => {
    if (auction && 
        new Date(auction.ends_at) <= new Date() && 
        !emailsSent && 
        !isSendingEmails) {
      
      const processAuctionWinners = async () => {
        setIsSendingEmails(true);
        
        try {
          console.log('Calling process-auction-winners function for auction:', auction.id);
          
          const { data: processData, error: processError } = await supabase.functions.invoke('process-auction-winners', {
            body: { auctionId: auction.id }
          });

          if (processError) {
            console.error('Error processing auction winners:', processError);
            toast({
              title: "Error processing auction winners",
              description: processError.message || "Please try again later",
              variant: "destructive"
            });
            return;
          }

          console.log('Auction winners processed:', processData);
          setEmailsSent(true);
          
          if (processData && processData.results && processData.results.length > 0) {
            const auction = processData.results[0];
            const winnerCount = auction.winners?.length || 0;
            
            toast({
              title: "Auction completed",
              description: `${winnerCount} winners have been notified`
            });
          } else {
            toast({
              title: "Auction completed",
              description: "No qualifying bids found for this auction",
              variant: "destructive"
            });
          }
          
          setAuction(prev => prev ? {...prev, winners_processed: true, status: 'completed'} : null);
          
          if (user) {
            const { data: winnerData } = await supabase
              .from('auction_winners')
              .select('*')
              .eq('auction_id', auction.id)
              .eq('user_id', user.id)
              .maybeSingle();
              
            if (winnerData) {
              setUserWinner(winnerData);
            }
          }
          
        } catch (error) {
          console.error('Error invoking process-auction-winners function:', error);
          toast({
            title: "Error processing auction winners",
            description: "An unexpected error occurred",
            variant: "destructive"
          });
        } finally {
          setIsSendingEmails(false);
        }
      };

      processAuctionWinners();
    }
  }, [auction, emailsSent, toast, isSendingEmails, user]);

  useEffect(() => {
    if (isAuctionEnded && emailsSent && currentUser && 
        bids.some(bid => bid.user_id === currentUser && bid.status === 'active') && 
        !topBidders.has(currentUser) && 
        !userWinner) {
      setUserLostAuction(true);
    } else {
      setUserLostAuction(false);
    }
  }, [isAuctionEnded, emailsSent, bids, currentUser, topBidders, userWinner]);

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
      const highestBid = bids.find(bid => 
        bid.amount === auction.current_price && 
        bid.status === 'active' && 
        bid.user_id !== currentUser
      );
      
      const outbidUserId = highestBid?.user_id;
      console.log("Current highest bidder who will be outbid:", outbidUserId);

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
        toast({
          title: "Error placing bid",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      try {
        console.log('Invoking bid-notification-email function with bid ID:', data.id);
        const { data: notificationData, error: notificationError } = await supabase.functions.invoke('bid-notification-email', {
          body: { bidId: data.id, amount: amount }
        });

        if (notificationError) {
          console.error('Error sending bid notifications:', notificationError);
          toast({
            title: "Warning",
            description: "Bid placed but there was an issue sending notifications",
            variant: "destructive",
          });
        } else {
          console.log('Notification response:', notificationData);
        }
        
        if (outbidUserId) {
          console.log('Sending outbid notification to user:', outbidUserId);
          
          const { data: outbidData, error: outbidError } = await supabase.functions.invoke('bid-notification-email', {
            body: { 
              auctionId: auction.id,
              outbidUserId: outbidUserId
            }
          });
          
          if (outbidError) {
            console.error('Error sending outbid notification:', outbidError);
          } else {
            console.log('Outbid notification response:', outbidData);
          }
        }
      } catch (notificationError) {
        console.error('Failed to invoke bid notification function:', notificationError);
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
    if (!userWinner && !auction) return;
    
    let bidId;
    
    if (userWinner && userWinner.winning_bid_id) {
      bidId = userWinner.winning_bid_id;
    } else {
      const userBids = bids.filter(bid => bid.user_id === currentUser && bid.status === 'active')
                          .sort((a, b) => b.amount - a.amount);
      
      if (userBids.length > 0) {
        bidId = userBids[0].id;
      } else {
        toast({
          title: "No eligible bid found",
          description: "Could not find a valid bid for payment",
          variant: "destructive"
        });
        return;
      }
    }
    
    navigate(`/payment/${bidId}`);
  };

  if (!auction) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  const isUserEligibleToPay = userWinner && 
    (userWinner.status === 'pending_payment' &&
     (isAuctionEnded && topBidders.has(currentUser || '')));
  
  const userHighestBid = currentUser ? 
    bids.filter(bid => bid.user_id === currentUser && bid.status === 'active')
        .sort((a, b) => b.amount - a.amount)[0] : null;
  
  const userHasSecurePlace = currentUser && topBidders.has(currentUser);
  
  const userHasBidsButNotWinning = currentUser && 
    bids.some(bid => bid.user_id === currentUser && bid.status === 'active') && 
    !topBidders.has(currentUser);
  
  const minimumBidToWin = bids.filter(bid => bid.status === 'active')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, auction.max_spots)
      .pop()?.amount || auction.current_price;
  
  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-start mb-4">
            <CardTitle className="text-3xl font-bold">{auction.title}</CardTitle>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="secondary">
                <Users className="w-4 h-4 mr-1" />
                {auction.max_spots} spots
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
              
              {userHasSecurePlace && !isAuctionEnded && (
                <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                  <Shield className="w-4 h-4 mr-1" />
                  Securing a place
                </Badge>
              )}
              
              {userHasBidsButNotWinning && !isAuctionEnded && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-600 bg-yellow-50">
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  Not winning
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

          {userLostAuction && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-xl font-semibold text-red-700 mb-2">You didn't win this auction</h3>
              <p className="mb-2">Unfortunately, your bids were not high enough to secure a spot in this auction.</p>
              <p className="text-sm text-red-700">Check out other auctions that are still available.</p>
              <Button 
                onClick={() => navigate('/')}
                className="mt-4 bg-red-600 hover:bg-red-700 text-white"
              >
                Browse Other Auctions
              </Button>
            </div>
          )}

          {isUserEligibleToPay && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-xl font-semibold text-green-700 mb-2">Congratulations on winning this auction!</h3>
              <p className="mb-4">Please complete your payment to claim your winnings.</p>
              <Button 
                onClick={handlePayment}
                className="bg-green-600 hover:bg-green-700"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Pay Now
              </Button>
            </div>
          )}

          {userHasSecurePlace && !isAuctionEnded && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-xl font-semibold text-green-700 mb-2">You're currently securing a place!</h3>
              <p className="mb-2">Your bid is among the top {auction.max_spots} bids right now.</p>
              <p className="text-sm text-green-700">Keep an eye on the auction as others may place higher bids.</p>
            </div>
          )}
          
          {userHasBidsButNotWinning && !isAuctionEnded && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="text-xl font-semibold text-yellow-700 mb-2">Your bid is not high enough!</h3>
              <p className="mb-2">You have placed bids, but they're not among the top {auction.max_spots} bids right now.</p>
              <p className="mb-4 text-sm text-yellow-700">
                Consider placing a higher bid to secure your place in this auction.
              </p>
              {userHighestBid && (
                <div className="text-sm bg-white p-2 rounded mb-4">
                  <p>Your highest bid: <strong>${userHighestBid.amount}</strong></p>
                  <p>Current minimum winning bid: <strong>${minimumBidToWin}</strong></p>
                </div>
              )}
              <Input
                type="number"
                placeholder="Enter higher bid amount"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                min={auction.current_price + 1}
                className="mb-2"
              />
              <Button 
                onClick={handleBid}
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                Place Higher Bid
              </Button>
            </div>
          )}
          
          {currentUser && !userHasBidsButNotWinning && !userHasSecurePlace && !isUserEligibleToPay && !isAuctionEnded && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-xl font-semibold text-blue-700 mb-2">Place a bid to secure your spot!</h3>
              <p className="mb-4">Place a bid now to try to secure one of the {auction.max_spots} available spots.</p>
              <div className="flex gap-4">
                <Input
                  type="number"
                  placeholder="Enter bid amount"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  min={auction.current_price + 1}
                />
                <Button onClick={handleBid}>
                  Place Bid
                </Button>
              </div>
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

              {!isAuctionEnded && !userHasBidsButNotWinning && (
                <div className="pt-4">
                  <div className="flex gap-4">
                    <Input
                      type="number"
                      placeholder="Enter bid amount"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      min={auction.current_price + 1}
                    />
                    <Button onClick={handleBid}>
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
                  const isCurrentUserBid = bid.user_id === currentUser;
                  
                  const userBids = bids.filter(b => 
                    b.user_id === bid.user_id && 
                    b.status === 'active'
                  );
                  
                  const userHighestBid = userBids.length > 0 
                    ? userBids.reduce((prev, current) => (prev.amount > current.amount) ? prev : current) 
                    : null;
                  
                  const isTopBidder = topBidders.has(bid.user_id);
                  const isUsersHighestBid = userHighestBid && bid.id === userHighestBid.id;
                  
                  const showTopBidderBadge = isTopBidder && isUsersHighestBid;
                  
                  const bidStyle = isCurrentUserBid ? 
                    (isUsersHighestBid && isTopBidder ? "bg-green-100" : "bg-red-100") : 
                    "bg-secondary/10";
                  
                  return (
                    <div key={bid.id} className={`flex justify-between items-center p-2 rounded ${bidStyle}`}>
                      <div className="flex items-center gap-2">
                        {isCurrentUserBid && isUsersHighestBid && (
                          isTopBidder ? 
                            <CheckCircle className="w-4 h-4 text-green-600" /> :
                            <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className={bid.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}>
                          ${bid.amount}
                        </span>
                        {showTopBidderBadge && (
                          <Badge variant="outline" className="ml-1 text-xs py-0 px-1">Top Bidder</Badge>
                        )}
                        {isCurrentUserBid && !isUsersHighestBid && (
                          <span className="text-xs text-muted-foreground ml-1">Previous bid</span>
                        )}
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
