
import { useEffect, useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Clock, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type Auction = Database['public']['Tables']['auctions']['Row'];

interface AuctionCardProps {
  id: string;
  title: string;
  description: string;
  startingPrice: number;
  currentPrice: number;
  maxSpots: number;
  filledSpots: number;
  endsAt: string;
  onBidClick: () => void;
}

export function AuctionCard({
  id,
  title,
  description,
  startingPrice,
  currentPrice: initialCurrentPrice,
  maxSpots,
  filledSpots: initialFilledSpots,
  endsAt,
  onBidClick,
}: AuctionCardProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [currentPrice, setCurrentPrice] = useState(initialCurrentPrice);
  const [filledSpots, setFilledSpots] = useState(initialFilledSpots);
  const { toast } = useToast();
  const isFullyBooked = filledSpots >= maxSpots;
  const isExpired = new Date(endsAt) <= new Date();

  useEffect(() => {
    // Subscribe to auction updates
    const channel = supabase
      .channel(`auction-card-${id}`)
      .on<Auction>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${id}` },
        (payload) => {
          console.log('Auction card update received:', payload);
          const newAuction = payload.new as Auction;
          if (newAuction && typeof newAuction.current_price === 'number') {
            setCurrentPrice(newAuction.current_price);
            setFilledSpots(newAuction.filled_spots ?? 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    const updateTimeLeft = () => {
      const end = new Date(endsAt);
      if (end > new Date()) {
        setTimeLeft(formatDistanceToNow(end, { addSuffix: true }));
      } else {
        setTimeLeft('Ended');
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [endsAt]);

  const handleBidClick = () => {
    if (isFullyBooked) {
      toast({
        title: "No spots available",
        description: "This auction has reached its maximum number of spots.",
        variant: "destructive",
      });
      return;
    }

    if (isExpired) {
      toast({
        title: "Auction ended",
        description: "This auction has already ended.",
        variant: "destructive",
      });
      return;
    }

    onBidClick();
  };

  const getSpotsBadgeVariant = () => {
    if (isFullyBooked) return "destructive";
    if (filledSpots >= maxSpots * 0.8) return "default";
    return "secondary";
  };

  return (
    <Card className="w-full max-w-sm hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="flex justify-between items-start">
          <span className="text-xl font-bold">{title}</span>
          <Badge variant={getSpotsBadgeVariant()}>
            <Users className="w-4 h-4 mr-1" />
            {filledSpots}/{maxSpots} spots
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Starting Price</span>
            <span className="font-semibold">${startingPrice}</span>
          </div>
          <div className="flex justify-between">
            <span>Current Bid</span>
            <span className="font-semibold">${currentPrice}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span className={`text-sm ${isExpired ? "text-red-500 font-semibold" : ""}`}>
              {timeLeft}
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          onClick={handleBidClick}
          disabled={isFullyBooked || isExpired}
          variant={isExpired ? "outline" : "default"}
        >
          {isFullyBooked ? 'Fully Booked' : isExpired ? 'Auction Ended' : 'Place Bid'}
        </Button>
      </CardFooter>
    </Card>
  );
}
