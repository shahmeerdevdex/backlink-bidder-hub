
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { Auction, Bid } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useNavigate } from "react-router-dom";

interface AuctionCardProps {
  auction: Auction;
  className?: string;
  onBidPlaced?: (newBid: Bid) => void;
}

export function AuctionCard({ auction, className, onBidPlaced }: AuctionCardProps) {
  const { user, isEmailVerified } = useAuth();
  const [bidAmount, setBidAmount] = useState<number | null>(null);
  const [isBidding, setIsBidding] = useState(false);
  const [highestBid, setHighestBid] = useState<number>(auction.current_price);
  const [timeRemaining, setTimeRemaining] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const intervalId = setInterval(() => {
      const endDate = new Date(auction.ends_at);
      setTimeRemaining(formatDistanceToNow(endDate));
    }, 60000); // Update every minute

    // Initial update
    const endDate = new Date(auction.ends_at);
    setTimeRemaining(formatDistanceToNow(endDate));

    return () => clearInterval(intervalId); // Clean up on unmount
  }, [auction.ends_at]);

  const placeBid = async () => {
    if (!user) {
      toast({
        title: "You must be signed in to place a bid.",
        description: "Please sign in to continue.",
        variant: "destructive",
      });
      return;
    }

    if (!bidAmount || bidAmount <= 0) {
      toast({
        title: "Invalid bid amount.",
        description: "Please enter a valid bid amount.",
        variant: "destructive",
      });
      return;
    }

    if (bidAmount <= highestBid) {
      toast({
        title: "Your bid must be higher than the current highest bid.",
        description: `The current highest bid is $${highestBid}.`,
        variant: "destructive",
      });
      return;
    }

    setIsBidding(true);

    try {
      // Optimistically update the UI
      setHighestBid(bidAmount);

      const { data: bid, error } = await supabase
        .from("bids")
        .insert([
          {
            auction_id: auction.id,
            user_id: user.id,
            amount: bidAmount,
          },
        ])
        .select("*")
        .single();

      if (error) {
        console.error("Error placing bid:", error);
        toast({
          title: "Error placing bid.",
          description: "Please try again.",
          variant: "destructive",
        });
        // Revert the optimistic update on error
        setHighestBid(auction.current_price);
      } else {
        // Call the callback to update the parent component's state
        onBidPlaced?.(bid as Bid);

        // Call the notification function with the bid ID, not the bid amount
        try {
          const { error: notificationError } = await supabase.functions.invoke('bid-notification-email', {
            body: { bidId: bid.id }
          });
          
          if (notificationError) {
            console.error("Error sending bid notifications:", notificationError);
          }
        } catch (notificationError) {
          console.error("Failed to invoke bid notification function:", notificationError);
        }

        // Show toast notification
        toast({
          title: `Bid of $${bid.amount} placed successfully!`,
          description: "Your bid has been recorded.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Unexpected error placing bid:", error);
      toast({
        title: "Unexpected error placing bid.",
        description: "Please try again later.",
        variant: "destructive",
      });
      // Revert the optimistic update on error
      setHighestBid(auction.current_price);
    } finally {
      setIsBidding(false);
    }
  };

  const handleViewAuction = () => {
    navigate(`/auctions/${auction.id}`);
  };

  const handleNavigateToAuth = () => {
    navigate('/auth');
  };

  // Format description by preserving newlines and paragraphs
  const formattedDescription = auction.description
    ? auction.description.split('\n').map((paragraph, index) => (
        <p key={index} className="mb-2">
          {paragraph}
        </p>
      ))
    : null;

  // For unauthenticated users, show more information but limit bidding functionality
  if (!user) {
    return (
      <Card className={cn("bg-secondary", className)}>
        <CardHeader>
          <CardTitle>{auction.title}</CardTitle>
          <CardDescription>
            Ends in {timeRemaining}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <div className="text-sm text-muted-foreground">
                {formattedDescription}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Starting Price</Label>
                <p className="text-lg">${auction.starting_price}</p>
              </div>
              <div>
                <Label>Current Highest Bid</Label>
                <p className="text-lg font-bold">${highestBid}</p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={handleNavigateToAuth}>
            <LogIn className="mr-2 h-4 w-4" />
            Sign In to Bid
          </Button>
          <Button onClick={handleViewAuction} className="ml-2">View Auction</Button>
        </CardFooter>
      </Card>
    );
  }

  // For authenticated users, show full card with bidding functionality
  return (
    <Card className={cn("bg-secondary", className)}>
      <CardHeader>
        <CardTitle>{auction.title}</CardTitle>
        <CardDescription>
          Ends in {timeRemaining}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Description</Label>
            <div className="text-sm text-muted-foreground">
              {formattedDescription}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Starting Price</Label>
              <p className="text-lg">${auction.starting_price}</p>
            </div>
            <div>
              <Label>Current Highest Bid</Label>
              <p className="text-xl font-bold">${highestBid}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bid">Your Bid</Label>
            <Input
              id="bid"
              placeholder="Enter your bid amount"
              type="number"
              onChange={(e) => setBidAmount(Number(e.target.value))}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={isBidding}>
              {isBidding ? (
                <>
                  Placing Bid <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                </>
              ) : (
                "Place Bid"
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to bid <strong>${bidAmount}</strong> on{" "}
                {auction.title}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={placeBid} disabled={isBidding}>
                {isBidding ? (
                  <>
                    Confirming <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  </>
                ) : (
                  "Confirm"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button onClick={handleViewAuction}>View Auction</Button>
      </CardFooter>
    </Card>
  );
}
