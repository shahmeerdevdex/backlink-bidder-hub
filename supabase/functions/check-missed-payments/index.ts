
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

    // Find winners who missed their payment deadline
    const { data: missedPayments, error: missedError } = await supabaseClient
      .from("auction_winners")
      .select("id, auction_id, user_id")
      .eq("status", "pending_payment")
      .lt("payment_deadline", new Date().toISOString());

    if (missedError) {
      throw new Error(`Error fetching missed payments: ${missedError.message}`);
    }

    if (!missedPayments || missedPayments.length === 0) {
      return new Response(
        JSON.stringify({ message: "No missed payments to process" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Processing ${missedPayments.length} missed payments`);

    // Process each missed payment
    const results = await Promise.all(
      missedPayments.map(async (missed) => {
        // Mark the winner as missed payment
        await supabaseClient
          .from("auction_winners")
          .update({ status: "payment_missed" })
          .eq("id", missed.id);

        // Get current winners for this auction
        const { data: currentWinners } = await supabaseClient
          .from("auction_winners")
          .select("user_id")
          .eq("auction_id", missed.auction_id);

        const currentWinnerIds = currentWinners?.map(w => w.user_id) || [];

        // Find next highest bidder who isn't already a winner
        const { data: nextBidder, error: nextError } = await supabaseClient
          .from("bids")
          .select("id, user_id, amount")
          .eq("auction_id", missed.auction_id)
          .eq("status", "active")
          .not("user_id", "in", `(${currentWinnerIds.join(',')})`)
          .order("amount", { ascending: false })
          .limit(1)
          .single();

        if (nextError || !nextBidder) {
          // No more eligible bidders
          return {
            auction_id: missed.auction_id,
            missed_winner_id: missed.user_id,
            message: "No more eligible bidders available"
          };
        }

        // Set 24 hour payment deadline for next bidder
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + 24);

        // Create new winner record for next bidder
        const { data: newWinner, error: newWinnerError } = await supabaseClient
          .from("auction_winners")
          .insert({
            auction_id: missed.auction_id,
            user_id: nextBidder.user_id,
            winning_bid_id: nextBidder.id,
            payment_deadline: deadline.toISOString(),
            status: "pending_payment"
          })
          .select()
          .single();

        if (newWinnerError) {
          throw new Error(`Error creating new winner: ${newWinnerError.message}`);
        }

        // Send email notification to new winner
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-winner-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`
            },
            body: JSON.stringify({
              winnerId: newWinner.id
            })
          });
        } catch (emailError) {
          console.error(`Error sending new winner email: ${emailError}`);
        }

        return {
          auction_id: missed.auction_id,
          missed_winner_id: missed.user_id,
          new_winner_id: nextBidder.user_id,
          new_winner_bid_amount: nextBidder.amount
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
    console.error("Error in check-missed-payments function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
