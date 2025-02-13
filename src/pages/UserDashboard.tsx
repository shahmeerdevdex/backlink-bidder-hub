
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
import { Award, Clock, CreditCard } from 'lucide-react';

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
  payments: Payment[]; // Changed from payment? to payments
}

interface WonAuction {
  id: string;
  auction: {
    id: string;
    title: string;
    ends_at: string;
  };
  winning_bid: {
    id: string;
    amount: number;
    payments: Payment[]; // Changed from payment? to payments
  };
}

export default function UserDashboard() {
  const [activeBids, setActiveBids] = useState<Bid[]>([]);
  const [wonAuctions, setWonAuctions] = useState<WonAuction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    fetchUserData();
  }, [user]);

  const fetchUserData = async () => {
    setIsLoading(true);
    try {
      // Fetch active bids with auction details
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

      // Fetch won auctions
      const { data: wonData, error: wonError } = await supabase
        .from('auction_winners')
        .select(`
          id,
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
              status
            )
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (wonError) throw wonError;
      setWonAuctions(wonData || []);
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
    
    // Get the latest payment
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
                        {getPaymentStatusBadge(won.winning_bid.payments)}
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
                          {(!won.winning_bid.payments || won.winning_bid.payments.length === 0 || 
                            won.winning_bid.payments[0].status === 'failed') && (
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
