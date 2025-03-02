
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

if (!resendApiKey) {
  console.error("RESEND_API_KEY is not set. Emails cannot be sent!");
}

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
    console.log("Starting send-winner-email function");
    
    const { auctionId } = await req.json();
    
    if (!auctionId) {
      console.error("Auction ID is missing in request");
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
        JSON.stringify({ error: "Auction not found", details: auctionError }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("Auction found:", auction.title);

    // Get top bidders for this auction up to max_spots
    const { data: topBids, error: topBidsError } = await supabase
      .from("bids")
      .select("id, user_id, amount")
      .eq("auction_id", auctionId)
      .eq("status", "active")
      .order("amount", { ascending: false })
      .limit(auction.max_spots);

    if (topBidsError) {
      console.error("Error fetching top bids:", topBidsError);
      return new Response(
        JSON.stringify({ error: "Error fetching top bids", details: topBidsError }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`Found ${topBids?.length || 0} top bidders to notify`);

    if (!topBids || topBids.length === 0) {
      return new Response(
        JSON.stringify({ message: "No winners to notify" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Send emails to each winner
    const emailPromises = topBids.map(async (bid) => {
      try {
        // Get the user profile to get the email
        const { data: user, error: userError } = await supabase.auth.admin.getUserById(bid.user_id);

        if (userError || !user) {
          console.error(`Error fetching user ${bid.user_id}:`, userError);
          return { userId: bid.user_id, success: false, error: "User not found" };
        }

        const email = user.user.email;
        if (!email) {
          console.error(`No email found for user ${bid.user_id}`);
          return { userId: bid.user_id, success: false, error: "User email not found" };
        }

        // Create a notification for the winner
        await supabase.from("notifications").insert({
          user_id: bid.user_id,
          type: "winner",
          message: `Congratulations! You won the auction: ${auction.title}`,
          auction_id: auctionId
        });

        console.log(`Sending winner email to ${email} for auction ${auction.title}`);
        
        // Send the email
        const emailResponse = await resend.emails.send({
          from: "Auction Platform <onboarding@resend.dev>",
          to: [email],
          subject: `Congratulations! You won the auction: ${auction.title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #2563eb;">Congratulations! 🎉</h1>
              <p>You are a winner in the auction: <strong>${auction.title}</strong></p>
              <p>Your winning bid amount: <strong>$${bid.amount}</strong></p>
              <p>Here are the details:</p>
              <ul>
                <li><strong>Auction Title:</strong> ${auction.title}</li>
                <li><strong>Description:</strong> ${auction.description}</li>
                <li><strong>Your Bid Amount:</strong> $${bid.amount}</li>
              </ul>
              <p style="color: #ef4444; font-weight: bold;">Important: Please complete your payment soon to secure your win!</p>
              <a href="${supabaseUrl.replace('.supabase.co', '.app')}/payment-page?bid_id=${bid.id}" style="display: inline-block; background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;">
                Pay Now
              </a>
              <p style="margin-top: 30px; font-size: 0.8em; color: #64748b;">
                If you have any questions, please contact our support team.
              </p>
            </div>
          `,
        });

        console.log(`Email sent to user ${bid.user_id}:`, emailResponse);
        return { userId: bid.user_id, success: true, data: emailResponse };
      } catch (error) {
        console.error(`Error sending email to user ${bid.user_id}:`, error);
        return { userId: bid.user_id, success: false, error: error.message };
      }
    });

    const emailResults = await Promise.all(emailPromises);
    console.log("Email sending results:", emailResults);
    
    // Update the auction to mark winners as processed
    await supabase
      .from("auctions")
      .update({ winners_processed: true })
      .eq("id", auctionId);
    
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
