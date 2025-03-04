
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { Resend } from 'npm:resend@2.0.0'

// Initialize Supabase client with admin privileges
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Initialize Resend email client
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const resend = new Resend(resendApiKey)

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('⚡ [INVOKED] bid-notification-email function started')
  console.log('Request method:', req.method)
  console.log('Request headers:', Object.fromEntries(req.headers.entries()))
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request (CORS preflight)')
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse the request body
    const requestText = await req.text()
    console.log('Raw request body:', requestText)
    
    const requestData = JSON.parse(requestText)
    const { bidId } = requestData
    
    console.log(`Processing notification for bid ID: ${bidId}`)
    
    if (!bidId) {
      console.error('Missing required parameter: bidId')
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: bidId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get bid details
    console.log(`Fetching bid details for ID: ${bidId}`)
    const { data: bid, error: bidError } = await supabase
      .from('bids')
      .select('id, amount, auction_id, user_id, is_initial')
      .eq('id', bidId)
      .single()

    if (bidError) {
      console.error(`Error fetching bid: ${bidError.message}`)
      return new Response(
        JSON.stringify({ error: `Error fetching bid: ${bidError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Bid data retrieved:`, bid)
    
    // Get auction details
    console.log(`Fetching auction details for ID: ${bid.auction_id}`)
    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', bid.auction_id)
      .single()

    if (auctionError) {
      console.error(`Error fetching auction: ${auctionError.message}`)
      return new Response(
        JSON.stringify({ error: `Error fetching auction: ${auctionError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Auction data retrieved:`, auction)
    
    // Get user details of the bidder
    console.log(`Fetching user details for ID: ${bid.user_id}`)
    const { data: bidderData, error: bidderError } = await supabase.auth.admin.getUserById(bid.user_id)

    if (bidderError) {
      console.error(`Error fetching bidder: ${bidderError.message}`)
      return new Response(
        JSON.stringify({ error: `Error fetching bidder: ${bidderError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const bidderEmail = bidderData.user?.email || 'Unknown bidder'
    console.log(`Bidder email: ${bidderEmail}`)

    // If this is an initial bid (from auction creation), notify auction creator only
    if (bid.is_initial) {
      console.log('This is an initial bid from auction creation, notifying only the creator')
      
      // Send email to the auction creator
      try {
        const emailResult = await resend.emails.send({
          from: 'Auction System <onboarding@resend.dev>',
          to: bidderEmail,
          subject: `Your auction "${auction.title}" has been created`,
          html: `
            <h1>Your Auction Has Been Created!</h1>
            <p>Your auction "<strong>${auction.title}</strong>" has been successfully created.</p>
            <p>Auction details:</p>
            <ul>
              <li>Description: ${auction.description}</li>
              <li>Starting price: $${auction.starting_price}</li>
              <li>Maximum spots: ${auction.max_spots}</li>
            </ul>
            <p>You will receive notifications when users place bids on your auction.</p>
            <p>Thank you for using our auction system!</p>
          `
        });

        console.log(`Email sent to creator (${bidderEmail}):`, emailResult);
      
        return new Response(
          JSON.stringify({
            message: `Auction creation email sent to ${bidderEmail}`,
            success: true
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } catch (error) {
        console.error(`Error sending email to creator: ${error.message}`);
        return new Response(
          JSON.stringify({ error: `Error sending email to creator: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // For regular bids, get all unique bidders for this auction (except the current bidder)
    console.log(`Fetching all bidders for auction ID: ${bid.auction_id}`)
    const { data: uniqueBidders, error: biddersError } = await supabase
      .from('bids')
      .select('user_id')
      .eq('auction_id', bid.auction_id)
      .eq('status', 'active')
      .neq('user_id', bid.user_id) // Exclude the current bidder
      .order('user_id')

    if (biddersError) {
      console.error(`Error fetching bidders: ${biddersError.message}`)
      return new Response(
        JSON.stringify({ error: `Error fetching bidders: ${biddersError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get unique bidder IDs
    const uniqueBidderIds = Array.from(new Set(uniqueBidders.map(b => b.user_id)))
    console.log(`Found ${uniqueBidderIds.length} unique bidders to notify`)

    if (uniqueBidderIds.length === 0) {
      console.log('No other bidders to notify')
      return new Response(
        JSON.stringify({ message: 'No other bidders to notify', successCount: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process each bidder
    const emailPromises = []
    
    for (const bidderId of uniqueBidderIds) {
      // Get user details for email
      console.log(`Fetching user details for bidder ID: ${bidderId}`)
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(bidderId)

      if (userError || !userData || !userData.user || !userData.user.email) {
        console.error(`Error or missing email for user with ID ${bidderId}`)
        continue
      }

      const userEmail = userData.user.email
      console.log(`Sending email to: ${userEmail}`)

      // Prepare email content
      const emailPromise = resend.emails.send({
        from: 'Auction System <onboarding@resend.dev>',
        to: userEmail,
        subject: `New bid placed on auction: ${auction.title}`,
        html: `
          <h1>New Bid Alert!</h1>
          <p>A new bid has been placed on the auction: <strong>${auction.title}</strong></p>
          <p>New bid amount: <strong>$${bid.amount}</strong></p>
          <p>Auction details:</p>
          <ul>
            <li>Description: ${auction.description}</li>
            <li>Starting price: $${auction.starting_price}</li>
            <li>Current highest bid: $${auction.current_price}</li>
          </ul>
          <p>Your position may have changed. Please log in to check your status.</p>
          <p>Thank you for participating!</p>
        `
      })
        .then(result => {
          console.log(`Email sent successfully to ${userEmail}, result:`, result)
          
          // Create notification in database
          return supabase
            .from('notifications')
            .insert({
              user_id: bidderId,
              type: 'new_bid',
              message: `New bid of $${bid.amount} placed on auction: ${auction.title}`,
              auction_id: bid.auction_id
            })
            .then(({ error: notificationError }) => {
              if (notificationError) {
                console.error(`Error creating notification: ${notificationError.message}`)
              } else {
                console.log(`Notification created for user ${bidderId}`)
              }
              return { success: true, email: userEmail }
            })
        })
        .catch(error => {
          console.error(`Error sending email to ${userEmail}: ${error.message}`)
          return { success: false, email: userEmail, error: error.message }
        })

      emailPromises.push(emailPromise)
    }

    // Wait for all emails to be sent
    console.log(`Waiting for ${emailPromises.length} emails to be sent`)
    const results = await Promise.all(emailPromises)
    console.log(`Email sending results:`, results)

    // Count successful emails
    const successCount = results.filter(r => r.success).length
    console.log(`Successfully sent ${successCount} emails`)

    // Return success response
    return new Response(
      JSON.stringify({
        message: `Sent ${successCount} notification emails`,
        successCount,
        results
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error(`Unhandled exception: ${error.message}`)
    console.error(error.stack)
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: error.stack
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
