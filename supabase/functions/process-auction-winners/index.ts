
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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find auctions that have ended but haven't been processed
    const { data: endedAuctions, error: auctionError } = await supabaseClient
      .from("auctions")
      .select("id, title, max_spots")
      .eq("status", "active")
      .lt("ends_at", new Date().toISOString());

    if (auctionError) {
      throw new Error(`Error fetching ended auctions: ${auctionError.message}`);
    }

    if (!endedAuctions || endedAuctions.length === 0) {
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
        // Mark auction as completed
        await supabaseClient
          .from("auctions")
          .update({ status: "completed" })
          .eq("id", auction.id);

        // Find top bidders for this auction
        const { data: topBids, error: bidError } = await supabaseClient
          .from("bids")
          .select("id, user_id, amount")
          .eq("auction_id", auction.id)
          .eq("status", "active")  // Only consider active bids
          .order("amount", { ascending: false })
          .limit(auction.max_spots || 3);

        if (bidError) {
          throw new Error(`Error fetching top bids: ${bidError.message}`);
        }

        if (!topBids || topBids.length === 0) {
          return {
            auction_id: auction.id,
            message: "No qualifying bids found",
            winners: []
          };
        }

        // Create auction_winners entries
        const winners = await Promise.all(
          topBids.map(async (bid) => {
            // Set 24 hour payment deadline
            const deadline = new Date();
            deadline.setHours(deadline.getHours() + 24);

            // Insert winner record
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
              return null;
            }

            // Send email notification to winner
            try {
              await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-winner-email`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
                },
                body: JSON.stringify({
                  winnerId: winner.id
                })
              });
            } catch (emailError) {
              console.error(`Error sending winner email: ${emailError}`);
            }

            return winner;
          })
        );

        return {
          auction_id: auction.id,
          title: auction.title,
          winners: winners.filter(Boolean)
        };
      })
    );

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
