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
import { useUser } from "@clerk/clerk-react";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface AuctionCardProps {
  auction: Auction;
  className?: string;
  onBidPlaced?: (newBid: Bid) => void;
}

export function AuctionCard({ auction, className, onBidPlaced }: AuctionCardProps) {
  const { isSignedIn, user } = useUser();
  const [bidAmount, setBidAmount] = useState<number | null>(null);
  const [isBidding, setIsBidding] = useState(false);
  const [highestBid, setHighestBid] = useState<number>(auction.current_price);
  const [timeRemaining, setTimeRemaining] = useState("");

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
    if (!isSignedIn || !user) {
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

        // Show toast notification
        toast({
          title: `Bid of $${bid.amount} placed successfully!`,
          description: "Your bid has been recorded.",
          variant: "default", // Changed from 'success' to 'default' to fix TypeScript error
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

  return (
    <Card className={cn("bg-secondary", className)}>
      <CardHeader>
        <CardTitle>{auction.title}</CardTitle>
        <CardDescription>
          {auction.description} - Ends in {timeRemaining}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="bid">Current Highest Bid</Label>
            <p className="text-xl font-bold">${highestBid}</p>
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
        <Button>View Auction</Button>
      </CardFooter>
    </Card>
  );
}
