
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("⚡ Starting process-auction-winners function");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse request body if this is being called directly
    let specificAuctionId = null;
    try {
      const requestData = await req.json();
      if (requestData && requestData.auctionId) {
        specificAuctionId = requestData.auctionId;
        console.log(`Processing specific auction ID: ${specificAuctionId}`);
      }
    } catch (e) {
      // No request body or not JSON, proceed with all ended auctions
      console.log("No specific auction ID provided, processing all ended auctions");
    }

    // Find auctions that have ended but haven't been processed
    const auctionQuery = supabaseClient
      .from("auctions")
      .select("id, title, max_spots")
      .lt("ends_at", new Date().toISOString());
    
    // If a specific auction ID was provided, add it to the query
    if (specificAuctionId) {
      auctionQuery.eq("id", specificAuctionId);
    }
    
    const { data: endedAuctions, error: auctionError } = await auctionQuery;

    if (auctionError) {
      throw new Error(`Error fetching ended auctions: ${auctionError.message}`);
    }

    if (!endedAuctions || endedAuctions.length === 0) {
      console.log("No ended auctions to process");
      return new Response(
        JSON.stringify({ message: "No ended auctions to process" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Processing ${endedAuctions.length} ended auctions`);

    // Process each ended auction
    const results = await Promise.all(
      endedAuctions.map(async (auction) => {
        console.log(`Processing auction: ${auction.id} - ${auction.title}`);
        
        // Mark auction as completed
        await supabaseClient
          .from("auctions")
          .update({ status: "completed" })
          .eq("id", auction.id);

        // Find all unique bidders for this auction
        const { data: uniqueBidders, error: uniqueBiddersError } = await supabaseClient
          .from("bids")
          .select("user_id")
          .eq("auction_id", auction.id)
          .eq("status", "active")
          .order("amount", { ascending: false })
          .not("user_id", "is", null);

        if (uniqueBiddersError) {
          throw new Error(`Error fetching unique bidders: ${uniqueBiddersError.message}`);
        }

        // Extract unique user IDs
        const uniqueUserIds = [...new Set(uniqueBidders?.map(bid => bid.user_id))];
        console.log(`Found ${uniqueUserIds.length} unique bidders for auction ${auction.id}`);

        // Limit to max_spots
        const maxSpots = auction.max_spots || 3;
        const eligibleUserIds = uniqueUserIds.slice(0, maxSpots);
        console.log(`Selected ${eligibleUserIds.length} winners out of ${maxSpots} max spots`);

        // For each eligible user, find their highest bid
        const winners = await Promise.all(
          eligibleUserIds.map(async (userId) => {
            // Find the highest bid for this user
            const { data: highestBid, error: bidError } = await supabaseClient
              .from("bids")
              .select("id, amount")
              .eq("auction_id", auction.id)
              .eq("user_id", userId)
              .eq("status", "active")
              .order("amount", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (bidError) {
              console.error(`Error finding highest bid for user ${userId}: ${bidError.message}`);
              return null;
            }

            if (!highestBid) {
              console.log(`No qualifying bid found for user ${userId}`);
              return null;
            }

            console.log(`Processing highest bid ${highestBid.id} from user ${userId} with amount ${highestBid.amount}`);
            
            // Check if this user is already a winner for this auction
            const { data: existingWinner } = await supabaseClient
              .from("auction_winners")
              .select("id")
              .eq("auction_id", auction.id)
              .eq("user_id", userId)
              .maybeSingle();

            if (existingWinner) {
              console.log(`User ${userId} is already a winner for auction ${auction.id}, skipping`);
              return existingWinner;
            }

            // Set 24 hour payment deadline
            const deadline = new Date();
            deadline.setHours(deadline.getHours() + 24);

            // Insert winner record
            const { data: winner, error: winnerError } = await supabaseClient
              .from("auction_winners")
              .insert({
                auction_id: auction.id,
                user_id: userId,
                winning_bid_id: highestBid.id,
                payment_deadline: deadline.toISOString(),
                status: "pending_payment"
              })
              .select()
              .single();

            if (winnerError) {
              console.error(`Error creating winner record: ${winnerError.message}`);
              return null;
            }

            console.log(`Created winner record for user ${userId} in auction ${auction.id}`);

            // Create notification for winner
            await supabaseClient
              .from("notifications")
              .insert({
                user_id: userId,
                type: "winner",
                message: `You've won the auction: ${auction.title} with a bid of $${highestBid.amount}`,
                auction_id: auction.id
              });

            // Send email notification to winner
            try {
              const emailResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-winner-email`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
                },
                body: JSON.stringify({
                  auctionId: auction.id
                })
              });
              
              if (!emailResponse.ok) {
                const errorData = await emailResponse.json();
                console.error(`Error response from send-winner-email:`, errorData);
              } else {
                console.log(`Email notification sent for winner ${userId}`);
              }
            } catch (emailError) {
              console.error(`Error sending winner email: ${emailError}`);
            }

            return winner;
          })
        );

        // Mark the auction as winners_processed
        await supabaseClient
          .from("auctions")
          .update({ winners_processed: true })
          .eq("id", auction.id);

        return {
          auction_id: auction.id,
          title: auction.title,
          winners: winners.filter(Boolean)
        };
      })
    );

    console.log(`Successfully processed ${results.length} auctions`);
    
    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in process-auction-winners function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
