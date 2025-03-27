
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AuctionCard } from '@/components/AuctionCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Auction, Bid } from '@/types';

export default function Index() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [sortBy, setSortBy] = useState<string>('ends_at');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAuctions = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('auctions')
        .select('*')
        .order(sortBy, { ascending: sortBy === 'current_price' ? false : true });

      if (error) {
        console.error('Error fetching auctions:', error);
        setIsLoading(false);
        return;
      }

      // Filter out auctions that have ended
      const currentDate = new Date();
      const activeAuctions = data?.filter(auction => 
        new Date(auction.ends_at) > currentDate
      ) || [];

      setAuctions(activeAuctions);
      setIsLoading(false);
    };

    fetchAuctions();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('public:auctions')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'auctions' }, 
        fetchAuctions
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sortBy]);

  const handleBidPlaced = (newBid: Bid) => {
    // Update the auction in the list with the new bid amount
    setAuctions(auctions.map(auction => 
      auction.id === newBid.auction_id 
        ? { ...auction, current_price: newBid.amount } 
        : auction
    ));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Active Auctions</h1>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ends_at">Time Left</SelectItem>
            <SelectItem value="current_price">Highest Bid</SelectItem>
            <SelectItem value="filled_spots">Popularity</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {auctions.map((auction) => (
            <AuctionCard
              key={auction.id}
              auction={auction}
              onBidPlaced={handleBidPlaced}
            />
          ))}
          {auctions.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No active auctions at the moment.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
