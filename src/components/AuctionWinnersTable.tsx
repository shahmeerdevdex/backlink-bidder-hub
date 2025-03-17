
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

export default function AuctionWinnersTable() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchWinners();
  }, []);

  const fetchWinners = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('auction_winners')
      .select(`
        id, 
        status, 
        payment_deadline,
        user_id (id, email:profiles!inner(email)),
        auction_id (id, title:auctions!inner(title)),
        winning_bid_id (id, amount:bids!inner(amount))
      `)
      .order('payment_deadline', { ascending: false });

    if (error) {
      toast({
        title: "Error fetching winners",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Transform the data structure to match our interface
    const formattedWinners = data?.map(record => ({
      id: record.id,
      user: {
        id: record.user_id[0].id,
        email: record.user_id[0].email
      },
      auction: {
        id: record.auction_id[0].id,
        title: record.auction_id[0].title
      },
      status: record.status || '',
      payment_deadline: record.payment_deadline,
      winning_bid: {
        id: record.winning_bid_id[0].id,
        amount: record.winning_bid_id[0].amount
      }
    })) || [];

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

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Auction Winners</h2>
        <Button onClick={fetchWinners} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {winners.length === 0 ? (
        <div className="text-center p-8 text-muted-foreground">
          No auction winners found.
        </div>
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
