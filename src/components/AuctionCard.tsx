
import { useEffect, useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Clock, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
  title,
  description,
  startingPrice,
  currentPrice,
  maxSpots,
  filledSpots,
  endsAt,
  onBidClick,
}: AuctionCardProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const { toast } = useToast();

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
    if (filledSpots >= maxSpots) {
      toast({
        title: "No spots available",
        description: "This auction has reached its maximum number of spots.",
        variant: "destructive",
      });
      return;
    }
    onBidClick();
  };

  return (
    <Card className="w-full max-w-sm hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="flex justify-between items-start">
          <span className="text-xl font-bold">{title}</span>
          <Badge variant={filledSpots >= maxSpots ? "destructive" : "secondary"}>
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
            <span className="text-sm">{timeLeft}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          onClick={handleBidClick}
          disabled={filledSpots >= maxSpots}
        >
          Place Bid
        </Button>
      </CardFooter>
    </Card>
  );
}
