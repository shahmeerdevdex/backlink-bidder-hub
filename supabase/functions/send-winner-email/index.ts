
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

    // Get request body
    const { winnerId } = await req.json();
    
    if (!winnerId) {
      throw new Error("Winner ID is required");
    }

    // Get the winner details with related information
    const { data: winner, error: winnerError } = await supabaseClient
      .from("auction_winners")
      .select(`
        id,
        user_id,
        auction_id,
        winning_bid_id,
        payment_deadline,
        auctions:auction_id (
          title
        ),
        profiles:user_id (
          email,
          username
        ),
        bids:winning_bid_id (
          amount
        )
      `)
      .eq("id", winnerId)
      .single();

    if (winnerError || !winner) {
      throw new Error(`Winner not found: ${winnerError?.message || "No data returned"}`);
    }

    // Creating a simple email content - in a real app, you'd use a proper email template
    const emailContent = `
      <h1>Congratulations! You've won a spot in the auction: ${winner.auctions.title}</h1>
      <p>Your bid amount: $${winner.bids.amount}</p>
      <p>Please complete your payment by: ${new Date(winner.payment_deadline).toLocaleString()}</p>
      <p>You have 24 hours to complete your payment, or your spot may be given to the next highest bidder.</p>
      <p><a href="${Deno.env.get("FRONTEND_URL")}/payment/${winner.winning_bid_id}">Click here to make your payment</a></p>
    `;

    // Create a notification in the database
    await supabaseClient.rpc("create_notification", {
      p_user_id: winner.user_id,
      p_type: "auction_win",
      p_message: `You've won a spot in the auction: ${winner.auctions.title}. Please complete your payment by ${new Date(winner.payment_deadline).toLocaleString()}.`
    });

    // In a real application, you would send an actual email here
    // For now, we'll just log it and return success
    console.log(`Email would be sent to: ${winner.profiles.email}`);
    console.log(`Email content: ${emailContent}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Notification created and email would be sent",
        recipient: winner.profiles.email
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in send-winner-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
