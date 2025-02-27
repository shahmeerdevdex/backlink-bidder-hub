
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Award, Clock, CreditCard, Trophy } from 'lucide-react';

interface Payment {
  id: string;
  status: string;
  amount: number;
}

interface Bid {
  id: string;
  amount: number;
  created_at: string;
  status: string;
  auction: {
    id: string;
    title: string;
    ends_at: string;
    current_price: number;
  };
  payments: Payment[];
}

interface WonAuction {
  id: string;
  status: string;
  payment_deadline: string;
  auction: {
    id: string;
    title: string;
    ends_at: string;
  };
  winning_bid: {
    id: string;
    amount: number;
    payments: Payment[];
  };
}

interface AuctionWinner {
  user_id: string;
  winning_bid: {
    amount: number;
  };
}

interface CompletedAuction {
  id: string;
  title: string;
  ends_at: string;
  winners: Array<{
    username: string | null;
    bid_amount: number;
    is_current_user: boolean;
  }>;
}

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function UserDashboard() {
  const [activeBids, setActiveBids] = useState<Bid[]>([]);
  const [wonAuctions, setWonAuctions] = useState<WonAuction[]>([]);
  const [completedAuctions, setCompletedAuctions] = useState<CompletedAuction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    fetchUserData();
    fetchNotifications();
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
        
      if (error) throw error;
      setNotifications(data || []);
      
      // Show unread notifications as toasts
      data?.filter(n => !n.read).forEach(notification => {
        toast({
          title: notification.type === 'winner' ? 'Auction Won!' : 'Notification',
          description: notification.message,
        });
      });
      
      // Mark notifications as read
      if (data && data.length > 0) {
        const unreadIds = data.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length > 0) {
          await supabase
            .from('notifications')
            .update({ read: true })
            .in('id', unreadIds);
        }
      }
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
    }
  };

  const fetchUserData = async () => {
    setIsLoading(true);
    try {
      // Fetch active bids
      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select(`
          id,
          amount,
          created_at,
          status,
          auction:auctions (
            id,
            title,
            ends_at,
            current_price
          ),
          payments:payments (
            id,
            status,
            amount
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (bidsError) throw bidsError;
      setActiveBids(bidsData || []);

      // Fetch auctions where user is a winner
      const { data: wonData, error: wonError } = await supabase
        .from('auction_winners')
        .select(`
          id,
          status,
          payment_deadline,
          auction:auctions (
            id,
            title,
            ends_at
          ),
          winning_bid:bids (
            id,
            amount,
            payments:payments (
              id,
              status,
              amount
            )
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (wonError) throw wonError;
      setWonAuctions(wonData || []);

      // Fetch all auctions the user has participated in that have ended
      const { data: userBids, error: userBidsError } = await supabase
        .from('bids')
        .select('auction_id')
        .eq('user_id', user?.id)
        .eq('status', 'active');
      
      if (userBidsError) throw userBidsError;
      
      // Get unique auction IDs
      const userAuctionIds = [...new Set((userBids || []).map(bid => bid.auction_id))];
      
      if (userAuctionIds.length === 0) {
        setCompletedAuctions([]);
        setIsLoading(false);
        return;
      }

      // Fetch completed auctions that the user has participated in
      const { data: completed, error: completedError } = await supabase
        .from('auctions')
        .select('*')
        .in('id', userAuctionIds)
        .lt('ends_at', new Date().toISOString())
        .order('ends_at', { ascending: false });

      if (completedError) throw completedError;

      console.log('Completed auctions:', completed);

      // For each completed auction, get the winners
      const completedWithWinners = await Promise.all((completed || []).map(async (auction) => {
        // Fetch winners for this auction
        const { data: winners, error: winnersError } = await supabase
          .from('auction_winners')
          .select(`
            user_id,
            winning_bid:bids(amount)
          `)
          .eq('auction_id', auction.id);

        if (winnersError) {
          console.error('Error fetching winners:', winnersError);
          return null;
        }

        // Get usernames for each winner
        const winnersWithUsernames = await Promise.all((winners || []).map(async (winner: AuctionWinner) => {
          // Get the profile data for each winner
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', winner.user_id)
            .maybeSingle();
          
          return {
            username: profile?.username || 'Anonymous',
            bid_amount: winner.winning_bid.amount,
            is_current_user: winner.user_id === user?.id
          };
        }));

        return {
          id: auction.id,
          title: auction.title,
          ends_at: auction.ends_at,
          winners: winnersWithUsernames
        };
      }));

      setCompletedAuctions(completedWithWinners.filter(Boolean) as CompletedAuction[]);
      
      // Check if user has won any auctions but no entry in auction_winners yet
      // This can happen if the process_auction_winners function hasn't run
      const endedAuctions = completed?.filter(auction => {
        // Check if this auction has already been processed (has winners)
        const hasWinners = wonData?.some(won => won.auction.id === auction.id);
        return !hasWinners && new Date(auction.ends_at) < new Date();
      }) || [];
      
      if (endedAuctions.length > 0) {
        for (const auction of endedAuctions) {
          // Get top bidders for this auction
          const { data: topBids, error: topBidsError } = await supabase
            .from('bids')
            .select('id, user_id, amount')
            .eq('auction_id', auction.id)
            .eq('status', 'active')
            .order('amount', { ascending: false })
            .limit(auction.max_spots || 3);
            
          if (topBidsError) {
            console.error('Error fetching top bids:', topBidsError);
            continue;
          }
          
          // Check if user is in top spots
          const userBid = topBids?.find(bid => bid.user_id === user?.id);
          if (userBid) {
            // Create a temporary "won auction" entry
            const tempWonAuction: WonAuction = {
              id: `temp_${auction.id}`,
              status: 'pending_processing',
              payment_deadline: new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
              auction: {
                id: auction.id,
                title: auction.title,
                ends_at: auction.ends_at
              },
              winning_bid: {
                id: userBid.id,
                amount: userBid.amount,
                payments: []
              }
            };
            
            // Add to won auctions if not already there
            setWonAuctions(prev => {
              if (!prev.some(won => won.auction.id === auction.id)) {
                return [...prev, tempWonAuction];
              }
              return prev;
            });
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Error fetching data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPaymentStatusBadge = (payments: Payment[] | undefined) => {
    if (!payments || payments.length === 0) return <Badge variant="secondary">No Payment</Badge>;
    
    const latestPayment = payments[0];
    
    switch (latestPayment.status) {
      case 'completed':
        return <Badge variant="default">Paid</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{latestPayment.status}</Badge>;
    }
  };

  const getWinnerStatusBadge = (auction: WonAuction) => {
    if (auction.status === 'pending_processing') {
      return <Badge variant="secondary">Processing</Badge>;
    }
    
    const deadline = new Date(auction.payment_deadline);
    const now = new Date();

    switch (auction.status) {
      case 'pending_payment':
        return (
          <div className="flex flex-col">
            <Badge variant="secondary">Payment Required</Badge>
            <span className="text-xs text-muted-foreground mt-1">
              Due {format(deadline, 'PPp')}
            </span>
          </div>
        );
      case 'payment_missed':
        return <Badge variant="destructive">Payment Missed</Badge>;
      case 'paid':
        return <Badge variant="default">Paid</Badge>;
      default:
        return <Badge variant="outline">{auction.status}</Badge>;
    }
  };

  const handlePayment = (bidId: string) => {
    navigate(`/payment/${bidId}`);
  };

  if (isLoading) {
    return <div className="container mx-auto p-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">My Dashboard</h1>

      <Tabs defaultValue="bids" className="space-y-6">
        <TabsList>
          <TabsTrigger value="bids">
            <Clock className="w-4 h-4 mr-2" />
            My Bids
          </TabsTrigger>
          <TabsTrigger value="won">
            <Award className="w-4 h-4 mr-2" />
            Won Auctions
          </TabsTrigger>
          <TabsTrigger value="completed">
            <Trophy className="w-4 h-4 mr-2" />
            Completed Auctions
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="w-4 h-4 mr-2" />
            Payments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bids">
          <Card>
            <CardHeader>
              <CardTitle>My Bids</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Auction</TableHead>
                    <TableHead>Your Bid</TableHead>
                    <TableHead>Current Price</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeBids.map((bid) => (
                    <TableRow key={bid.id}>
                      <TableCell>{bid.auction.title}</TableCell>
                      <TableCell>${bid.amount}</TableCell>
                      <TableCell>${bid.auction.current_price}</TableCell>
                      <TableCell>
                        {format(new Date(bid.auction.ends_at), 'PPp')}
                      </TableCell>
                      <TableCell>
                        {getPaymentStatusBadge(bid.payments)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/auctions/${bid.auction.id}`)}
                        >
                          View Auction
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {activeBids.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">
                        You haven't placed any bids yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="won">
          <Card>
            <CardHeader>
              <CardTitle>Won Auctions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Auction</TableHead>
                    <TableHead>Winning Bid</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wonAuctions.map((won) => (
                    <TableRow key={won.id}>
                      <TableCell>{won.auction.title}</TableCell>
                      <TableCell>${won.winning_bid.amount}</TableCell>
                      <TableCell>
                        {format(new Date(won.auction.ends_at), 'PPp')}
                      </TableCell>
                      <TableCell>
                        {getWinnerStatusBadge(won)}
                      </TableCell>
                      <TableCell>
                        <div className="space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/auctions/${won.auction.id}`)}
                          >
                            View Auction
                          </Button>
                          {won.status === 'pending_payment' && (
                            <Button
                              size="sm"
                              onClick={() => handlePayment(won.winning_bid.id)}
                            >
                              Pay Now
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {wonAuctions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">
                        You haven't won any auctions yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle>Completed Auctions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Auction</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Winners</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedAuctions.map((auction) => (
                    <TableRow key={auction.id}>
                      <TableCell>{auction.title}</TableCell>
                      <TableCell>
                        {format(new Date(auction.ends_at), 'PPp')}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          {auction.winners.map((winner, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <Badge variant={winner.is_current_user ? "default" : "secondary"}>
                                {index + 1}
                              </Badge>
                              <span className={winner.is_current_user ? "font-semibold" : ""}>
                                {winner.username || 'Anonymous'}: ${winner.bid_amount}
                              </span>
                              {winner.is_current_user && (
                                <Trophy className="w-4 h-4 text-yellow-500" />
                              )}
                            </div>
                          ))}
                          {auction.winners.length === 0 && (
                            <span className="text-muted-foreground">No winners yet</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/auctions/${auction.id}`)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {completedAuctions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">
                        No completed auctions available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Auction</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeBids.filter(bid => bid.payments && bid.payments.length > 0).map((bid) => (
                    bid.payments.map(payment => (
                      <TableRow key={payment.id}>
                        <TableCell>{bid.auction.title}</TableCell>
                        <TableCell>${payment.amount}</TableCell>
                        <TableCell>
                          {format(new Date(bid.created_at), 'PPp')}
                        </TableCell>
                        <TableCell>
                          {getPaymentStatusBadge([payment])}
                        </TableCell>
                      </TableRow>
                    ))
                  ))}
                  {activeBids.filter(bid => bid.payments && bid.payments.length > 0).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center">
                        No payment history available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
