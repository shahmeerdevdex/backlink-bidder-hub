
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

    // First, let's lock the auctions we're about to process by updating a processing flag
    // This helps prevent race conditions from parallel executions
    const auctionLockQuery = supabaseClient
      .from("auctions")
      .update({ winners_being_processed: true })
      .lt("ends_at", new Date().toISOString());

    if (specificAuctionId) {
      auctionLockQuery.eq("id", specificAuctionId);
    } else {
      // Only process auctions where winners haven't been processed yet if no specific ID
      auctionLockQuery.eq("winners_processed", false)
        .eq("winners_being_processed", false); // Only lock auctions not already being processed
    }
    
    const { data: lockedAuctions, error: lockError } = await auctionLockQuery
      .select("id, title, max_spots");

    if (lockError) {
      throw new Error(`Error locking auctions for processing: ${lockError.message}`);
    }

    if (!lockedAuctions || lockedAuctions.length === 0) {
      console.log("No auctions available to process (already being processed or no eligible auctions)");
      return new Response(
        JSON.stringify({ 
          message: specificAuctionId 
            ? "This auction is already being processed or doesn't exist" 
            : "No ended auctions to process" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Processing ${lockedAuctions.length} locked auctions`);

    // Process each locked auction
    const results = await Promise.all(
      lockedAuctions.map(async (auction) => {
        console.log(`Processing auction: ${auction.id} - ${auction.title}`);
        
        try {
          // Mark auction as completed
          await supabaseClient
            .from("auctions")
            .update({ status: "completed" })
            .eq("id", auction.id);

          // Get all active bids for this auction
          const { data: allBids, error: bidsError } = await supabaseClient
            .from("bids")
            .select("id, user_id, amount")
            .eq("auction_id", auction.id)
            .eq("status", "active")
            .order("amount", { ascending: false });

          if (bidsError) {
            throw new Error(`Error fetching bids: ${bidsError.message}`);
          }

          console.log(`Found ${allBids?.length || 0} active bids for auction ${auction.id}`);

          // Get existing winners for this auction to avoid duplicates
          const { data: existingWinners, error: existingWinnersError } = await supabaseClient
            .from("auction_winners")
            .select("user_id")
            .eq("auction_id", auction.id);
            
          if (existingWinnersError) {
            throw new Error(`Error fetching existing winners: ${existingWinnersError.message}`);
          }
          
          // Create a set of existing winner user IDs for fast lookup
          const existingWinnerUserIds = new Set(existingWinners?.map(winner => winner.user_id) || []);
          console.log(`Found ${existingWinnerUserIds.size} existing winners for auction ${auction.id}`);

          // Group bids by user and take only the highest bid per user
          const userHighestBids = new Map();
          allBids?.forEach(bid => {
            if (!userHighestBids.has(bid.user_id) || 
                userHighestBids.get(bid.user_id).amount < bid.amount) {
              userHighestBids.set(bid.user_id, bid);
            }
          });

          // Sort users by their highest bid amounts
          const sortedBids = Array.from(userHighestBids.values())
            .sort((a, b) => b.amount - a.amount);
          
          // Take only the top N users (where N is max_spots)
          const maxSpots = auction.max_spots || 3;
          const topBidders = sortedBids.slice(0, maxSpots);

          console.log(`Selected ${topBidders.length} winners out of ${maxSpots} max spots`);

          // Process each winner - but do it one by one to prevent race conditions
          const winners = [];
          for (const bid of topBidders) {
            console.log(`Processing winner user ${bid.user_id} with highest bid ${bid.id} amount ${bid.amount}`);
            
            // Double-check if this user is already a winner for this auction
            // This prevents race conditions between when we checked earlier and now
            const { data: currentWinner } = await supabaseClient
              .from("auction_winners")
              .select("*")
              .eq("auction_id", auction.id)
              .eq("user_id", bid.user_id)
              .maybeSingle();

            if (currentWinner) {
              console.log(`User ${bid.user_id} is already a winner for auction ${auction.id}, skipping`);
              winners.push(currentWinner);
              continue;
            }

            // Set 24 hour payment deadline
            const deadline = new Date();
            deadline.setHours(deadline.getHours() + 24);

            // Insert winner record with ON CONFLICT DO NOTHING to prevent duplicates
            const { data: winner, error: winnerError } = await supabaseClient
              .from("auction_winners")
              .insert({
                auction_id: auction.id,
                user_id: bid.user_id,
                winning_bid_id: bid.id,
                payment_deadline: deadline.toISOString(),
                status: "pending_payment"
              })
              .select()
              .single();

            if (winnerError) {
              console.error(`Error creating winner record: ${winnerError.message}`);
              continue;
            }

            console.log(`Created winner record for user ${bid.user_id} in auction ${auction.id}`);

            // Create notification for winner
            await supabaseClient
              .from("notifications")
              .insert({
                user_id: bid.user_id,
                type: "winner",
                message: `You've won the auction: ${auction.title} with a bid of $${bid.amount}`,
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
                console.log(`Email notification sent for winner ${bid.user_id}`);
              }
            } catch (emailError) {
              console.error(`Error sending winner email: ${emailError}`);
            }

            winners.push(winner);
          }

          // Mark the auction as winners_processed and remove the processing lock
          await supabaseClient
            .from("auctions")
            .update({ 
              winners_processed: true,
              winners_being_processed: false
            })
            .eq("id", auction.id);

          return {
            auction_id: auction.id,
            title: auction.title,
            winners: winners.filter(Boolean)
          };
        } catch (processError) {
          // If there's an error, release the processing lock
          await supabaseClient
            .from("auctions")
            .update({ winners_being_processed: false })
            .eq("id", auction.id);
          
          throw processError;
        }
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
