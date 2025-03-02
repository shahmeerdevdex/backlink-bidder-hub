
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { Resend } from "npm:resend@2.0.0";

// Initialize Supabase client with service role key (needed to access user emails)
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Resend for email sending
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const resend = new Resend(resendApiKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { auctionId } = await req.json();
    
    if (!auctionId) {
      return new Response(
        JSON.stringify({ error: "Auction ID is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Processing winner emails for auction: ${auctionId}`);

    // Fetch the auction details
    const { data: auction, error: auctionError } = await supabase
      .from("auctions")
      .select("*")
      .eq("id", auctionId)
      .single();

    if (auctionError || !auction) {
      console.error("Error fetching auction:", auctionError);
      return new Response(
        JSON.stringify({ error: "Auction not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Fetch the winners for this auction
    const { data: winners, error: winnersError } = await supabase
      .from("auction_winners")
      .select("*, bids(*)")
      .eq("auction_id", auctionId)
      .eq("status", "pending_payment");

    if (winnersError) {
      console.error("Error fetching winners:", winnersError);
      return new Response(
        JSON.stringify({ error: "Error fetching winners" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Found ${winners?.length || 0} winners to notify`);

    if (!winners || winners.length === 0) {
      return new Response(
        JSON.stringify({ message: "No winners to notify" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Send emails to each winner
    const emailPromises = winners.map(async (winner) => {
      try {
        // Get the user profile to get the email
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", winner.user_id)
          .single();

        if (profileError || !profile) {
          console.error(`Error fetching profile for user ${winner.user_id}:`, profileError);
          return { userId: winner.user_id, success: false, error: "User profile not found" };
        }

        const bidAmount = winner.bids?.amount || "N/A";
        const paymentDeadline = new Date(winner.payment_deadline).toLocaleString();
        
        // Send the email
        const emailResponse = await resend.emails.send({
          from: "Auction Platform <onboarding@resend.dev>",
          to: [profile.email],
          subject: `Congratulations! You won the auction: ${auction.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #2563eb;">Congratulations! 🎉</h1>
              <p>You are a winner in the auction: <strong>${auction.title}</strong></p>
              <p>Your winning bid amount: <strong>$${bidAmount}</strong></p>
              <p>Here are the details:</p>
              <ul>
                <li><strong>Auction Title:</strong> ${auction.title}</li>
                <li><strong>Description:</strong> ${auction.description}</li>
                <li><strong>Your Bid Amount:</strong> $${bidAmount}</li>
                <li><strong>Payment Deadline:</strong> ${paymentDeadline}</li>
              </ul>
              <p style="color: #ef4444; font-weight: bold;">Important: You must complete your payment before the deadline to secure your win!</p>
              <a href="${supabaseUrl.replace('.supabase.co', '.app')}/payment-page?bid_id=${winner.winning_bid_id}" style="display: inline-block; background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;">
                Pay Now
              </a>
              <p style="margin-top: 30px; font-size: 0.8em; color: #64748b;">
                If you have any questions, please contact our support team.
              </p>
            </div>
          `,
        });

        console.log(`Email sent to user ${winner.user_id}:`, emailResponse);
        return { userId: winner.user_id, success: true, data: emailResponse };
      } catch (error) {
        console.error(`Error sending email to user ${winner.user_id}:`, error);
        return { userId: winner.user_id, success: false, error: error.message };
      }
    });

    const emailResults = await Promise.all(emailPromises);
    console.log("Email sending results:", emailResults);
    
    return new Response(
      JSON.stringify({ 
        message: "Winner emails processed", 
        results: emailResults,
        successCount: emailResults.filter(r => r.success).length,
        failureCount: emailResults.filter(r => !r.success).length
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error in send-winner-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
