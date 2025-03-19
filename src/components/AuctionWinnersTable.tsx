import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, InfoIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Winner {
  id: string;
  user: {
    id: string;
    email: string;
  };
  auction: {
    id: string;
    title: string;
  };
  status: string;
  payment_deadline: string;
  winning_bid: {
    id: string;
    amount: number;
  };
  email_sent: boolean;
}

interface Auction {
  id: string;
  title: string;
}

interface UserBid {
  id: string;
  amount: number;
  created_at: string;
  auction_title: string;
  status: string;
}

export default function AuctionWinnersTable() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>('all');
  const [selectedWinner, setSelectedWinner] = useState<Winner | null>(null);
  const [userBids, setUserBids] = useState<UserBid[]>([]);
  const [userBidsLoading, setUserBidsLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAuctions();
    fetchWinners();
  }, []);

  useEffect(() => {
    fetchWinners();
  }, [selectedAuctionId]);

  const fetchAuctions = async () => {
    try {
      const { data, error } = await supabase
        .from('auctions')
        .select('id, title')
        .order('title');

      if (error) {
        toast({
          title: "Error fetching auctions",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setAuctions(data || []);
    } catch (error) {
      console.error("Error fetching auctions:", error);
      toast({
        title: "Error fetching auctions",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const fetchWinners = async () => {
    setLoading(true);
    
    try {
      console.log("Fetching winners with selectedAuctionId:", selectedAuctionId);
      
      // First, fetch all user profiles into a map for quick lookup
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email');
      
      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        throw profilesError;
      }
      
      console.log("Fetched profiles:", profilesData?.length || 0);
      
      // Create a map of user IDs to their email addresses for quick access
      const userMap = new Map();
      profilesData?.forEach(profile => {
        userMap.set(profile.id, profile.email);
      });
      
      // Now fetch the winners with a single query
      let query = supabase
        .from('auction_winners')
        .select(`
          id, 
          status, 
          payment_deadline,
          user_id,
          email_sent,
          auction_id(id, title),
          winning_bid_id(id, amount)
        `);

      if (selectedAuctionId !== 'all') {
        query = query.eq('auction_id', selectedAuctionId);
      }

      query = query.order('payment_deadline', { ascending: false });
      
      const { data: winnersData, error: winnersError } = await query;
      
      console.log("Winners data raw:", winnersData);
      
      if (winnersError) {
        console.error("Error fetching winners:", winnersError);
        throw winnersError;
      }

      // Transform the data to match the Winner interface
      const formattedWinners = winnersData?.map(winner => ({
        id: winner.id,
        user: {
          id: winner.user_id,
          email: userMap.get(winner.user_id) || 'Unknown user'
        },
        auction: {
          id: winner.auction_id?.id || '',
          title: winner.auction_id?.title || ''
        },
        status: winner.status || '',
        payment_deadline: winner.payment_deadline,
        winning_bid: {
          id: winner.winning_bid_id?.id || '',
          amount: winner.winning_bid_id?.amount || 0
        },
        email_sent: winner.email_sent || false
      })) || [];

      console.log("Formatted winners:", formattedWinners);
      setWinners(formattedWinners);
    } catch (error) {
      toast({
        title: "Error fetching data",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchUserBidHistory = async (userId: string) => {
    setUserBidsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('bids')
        .select(`
          id,
          amount,
          created_at,
          status,
          auction_id(title)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      const formattedBids = data?.map(bid => ({
        id: bid.id,
        amount: bid.amount,
        created_at: bid.created_at,
        auction_title: bid.auction_id?.title || 'Unknown auction',
        status: bid.status
      })) || [];
      
      setUserBids(formattedBids);
    } catch (error) {
      toast({
        title: "Error fetching user bid history",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setUserBidsLoading(false);
    }
  };

  const handleViewDetails = (winner: Winner) => {
    setSelectedWinner(winner);
    fetchUserBidHistory(winner.user.id);
    setDetailsOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_payment':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending Payment</Badge>;
      case 'paid':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paid</Badge>;
      case 'payment_missed':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Payment Missed</Badge>;
      case 'service_delivered':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Service Delivered</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading && selectedAuctionId === 'all') {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h2 className="text-xl font-semibold">Auction Winners</h2>
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <div className="w-full md:w-72">
            <Select
              value={selectedAuctionId}
              onValueChange={setSelectedAuctionId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an auction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Auctions</SelectItem>
                {auctions.map((auction) => (
                  <SelectItem key={auction.id} value={auction.id}>
                    {auction.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={() => {
              console.log("Manual refresh triggered");
              fetchWinners();
            }} 
            variant="outline" 
            size="sm"
          >
            Refresh
          </Button>
        </div>
      </div>

      {loading && selectedAuctionId !== 'all' ? (
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : winners.length === 0 ? (
        <Card>
          <CardContent className="text-center p-8 text-muted-foreground">
            {selectedAuctionId === 'all' ? 
              "No auction winners found." : 
              "No winners found for this auction."}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Auction</TableHead>
                <TableHead>Bid Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment Deadline</TableHead>
                <TableHead>Email Sent</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {winners.map((winner) => (
                <TableRow 
                  key={winner.id}
                  className="cursor-pointer"
                  onClick={() => handleViewDetails(winner)}
                >
                  <TableCell className="font-medium">{winner.user.email}</TableCell>
                  <TableCell>{winner.auction.title}</TableCell>
                  <TableCell>${winner.winning_bid.amount}</TableCell>
                  <TableCell>{getStatusBadge(winner.status)}</TableCell>
                  <TableCell>
                    {winner.payment_deadline ? 
                      new Date(winner.payment_deadline).toLocaleString() : 'N/A'}
                  </TableCell>
                  <TableCell>
                    {winner.email_sent ? 
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Sent</Badge> : 
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      className="flex items-center" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDetails(winner);
                      }}
                    >
                      <InfoIcon className="w-4 h-4 mr-1" />
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Winner Details</DialogTitle>
            <DialogDescription>
              Information about the auction winner and their bid history
            </DialogDescription>
          </DialogHeader>
          
          {selectedWinner && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Auction Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold">Title</h3>
                    <p>{selectedWinner.auction.title}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold">Winner</h3>
                    <p>{selectedWinner.user.email}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold">Status</h3>
                    <div className="mt-1">{getStatusBadge(selectedWinner.status)}</div>
                  </div>
                  <div>
                    <h3 className="font-semibold">Winning Bid</h3>
                    <p>${selectedWinner.winning_bid.amount}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold">Payment Deadline</h3>
                    <p>{selectedWinner.payment_deadline ? 
                      new Date(selectedWinner.payment_deadline).toLocaleString() : 'N/A'}</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>User Bid History</CardTitle>
                </CardHeader>
                <CardContent>
                  {userBidsLoading ? (
                    <div className="flex justify-center items-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : userBids.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      No bid history found for this user.
                    </p>
                  ) : (
                    <div className="max-h-[300px] overflow-auto">
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
                          {userBids.map((bid) => (
                            <TableRow key={bid.id}>
                              <TableCell className="max-w-[150px] truncate">{bid.auction_title}</TableCell>
                              <TableCell>${bid.amount}</TableCell>
                              <TableCell>{new Date(bid.created_at).toLocaleDateString()}</TableCell>
                              <TableCell>
                                <Badge variant={bid.status === 'active' ? 'outline' : 'secondary'}>
                                  {bid.status === 'active' ? 'Active' : bid.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
