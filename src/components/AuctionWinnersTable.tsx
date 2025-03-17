
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
import { Loader2, CheckCircle, AlertTriangle, Ban } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
}

interface Auction {
  id: string;
  title: string;
}

export default function AuctionWinnersTable() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    fetchAuctions();
    fetchWinners();
  }, []);

  useEffect(() => {
    fetchWinners();
  }, [selectedAuctionId]);

  const fetchAuctions = async () => {
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
  };

  const fetchWinners = async () => {
    setLoading(true);
    
    let query = supabase
      .from('auction_winners')
      .select(`
        id, 
        status, 
        payment_deadline,
        user_id,
        auction_id(id, title),
        winning_bid_id(id, amount)
      `);

    if (selectedAuctionId !== 'all') {
      query = query.eq('auction_id', selectedAuctionId);
    }

    query = query.order('payment_deadline', { ascending: false });
    
    const { data: winnersData, error: winnersError } = await query;

    if (winnersError) {
      toast({
        title: "Error fetching winners",
        description: winnersError.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Fetch user data for each winner
    const winnerPromises = winnersData?.map(async (winner) => {
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('id', winner.user_id)
        .single();

      if (userError) {
        console.error("Error fetching user data:", userError);
        return null;
      }

      return {
        id: winner.id,
        user: {
          id: userData?.id || '',
          email: userData?.email || ''
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
        }
      };
    }) || [];

    const formattedWinners = (await Promise.all(winnerPromises)).filter(Boolean) as Winner[];
    setWinners(formattedWinners);
    setLoading(false);
  };

  const updateWinnerStatus = async (winnerId: string, newStatus: string) => {
    const { error } = await supabase
      .from('auction_winners')
      .update({ status: newStatus })
      .eq('id', winnerId);

    if (error) {
      toast({
        title: "Error updating winner status",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Status updated",
      description: `Winner status updated to ${newStatus}`,
    });

    // Refresh winners list
    fetchWinners();
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
          <Button onClick={fetchWinners} variant="outline" size="sm">
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {winners.map((winner) => (
                <TableRow key={winner.id}>
                  <TableCell className="font-medium">{winner.user.email}</TableCell>
                  <TableCell>{winner.auction.title}</TableCell>
                  <TableCell>${winner.winning_bid.amount}</TableCell>
                  <TableCell>{getStatusBadge(winner.status)}</TableCell>
                  <TableCell>
                    {winner.payment_deadline ? 
                      new Date(winner.payment_deadline).toLocaleString() : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      {winner.status === 'paid' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex items-center" 
                          onClick={() => updateWinnerStatus(winner.id, 'service_delivered')}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Mark Delivered
                        </Button>
                      )}
                      {winner.status === 'pending_payment' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex items-center" 
                          onClick={() => updateWinnerStatus(winner.id, 'paid')}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Mark Paid
                        </Button>
                      )}
                      {winner.status !== 'payment_missed' && winner.status !== 'service_delivered' && (
                        <Button 
                          size="sm" 
                          variant="destructive"
                          className="flex items-center" 
                          onClick={() => updateWinnerStatus(winner.id, 'payment_missed')}
                        >
                          <Ban className="w-4 h-4 mr-1" />
                          Mark Missed
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
