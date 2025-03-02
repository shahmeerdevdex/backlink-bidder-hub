
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
  console.log('⚡ [INVOKED] send-winner-email function started')
  console.log('Resend API Key exists:', !!resendApiKey)
  console.log('Supabase URL:', supabaseUrl)
  console.log('Supabase Service Role Key exists:', !!supabaseKey)
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request (CORS preflight)')
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse the request body
    const requestData = await req.json()
    const { auctionId } = requestData
    
    console.log(`Processing auction ID: ${auctionId}`)
    
    if (!auctionId) {
      console.error('Missing required parameter: auctionId')
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: auctionId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get auction details
    console.log(`Fetching auction details for ID: ${auctionId}`)
    const { data: auction, error: auctionError } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', auctionId)
      .single()

    if (auctionError) {
      console.error(`Error fetching auction: ${auctionError.message}`)
      return new Response(
        JSON.stringify({ error: `Error fetching auction: ${auctionError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Auction data retrieved:`, auction)
    
    // Find winners (top bidders based on max_spots)
    console.log(`Fetching top bidders for auction with max_spots: ${auction.max_spots}`)
    const { data: topBids, error: bidsError } = await supabase
      .from('bids')
      .select('id, user_id, amount')
      .eq('auction_id', auctionId)
      .eq('status', 'active')
      .order('amount', { ascending: false })
      .limit(auction.max_spots || 3)

    if (bidsError) {
      console.error(`Error fetching top bids: ${bidsError.message}`)
      return new Response(
        JSON.stringify({ error: `Error fetching top bids: ${bidsError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${topBids?.length || 0} top bidders`)
    console.log(`Top bids data:`, topBids)

    if (!topBids || topBids.length === 0) {
      console.log('No eligible winners found')
      return new Response(
        JSON.stringify({ message: 'No eligible winners found', successCount: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process each winner
    let successCount = 0
    const emailPromises = []
    
    for (const bid of topBids) {
      // Get user details for email
      console.log(`Fetching user details for user ID: ${bid.user_id}`)
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(bid.user_id)

      if (userError) {
        console.error(`Error fetching user with ID ${bid.user_id}: ${userError.message}`)
        continue
      }

      if (!userData || !userData.user || !userData.user.email) {
        console.error(`No email found for user with ID ${bid.user_id}`)
        continue
      }

      const userEmail = userData.user.email
      console.log(`Processing email to: ${userEmail}`)

      // Prepare email content
      const emailPromise = resend.emails.send({
        from: 'Auction System <onboarding@resend.dev>',
        to: userEmail,
        subject: `Congratulations! You've won the auction: ${auction.title}`,
        html: `
          <h1>Congratulations!</h1>
          <p>You are one of the winning bidders for the auction: <strong>${auction.title}</strong></p>
          <p>Your winning bid amount: <strong>$${bid.amount}</strong></p>
          <p>Please log in to your account to complete the payment process within 24 hours.</p>
          <p>Thank you for participating!</p>
        `
      })
        .then(result => {
          console.log(`Email sent successfully to ${userEmail}, result:`, result)
          
          // Create notification in database
          return supabase
            .from('notifications')
            .insert({
              user_id: bid.user_id,
              type: 'winner',
              message: `You've won the auction: ${auction.title} with a bid of $${bid.amount}`,
              auction_id: auctionId
            })
            .then(({ error: notificationError }) => {
              if (notificationError) {
                console.error(`Error creating notification: ${notificationError.message}`)
              } else {
                console.log(`Notification created for user ${bid.user_id}`)
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
    successCount = results.filter(r => r.success).length
    console.log(`Successfully sent ${successCount} emails`)

    // Mark auction as processed
    console.log(`Updating auction ${auctionId} as processed`)
    const { error: updateError } = await supabase
      .from('auctions')
      .update({ winners_processed: true })
      .eq('id', auctionId)

    if (updateError) {
      console.error(`Error updating auction status: ${updateError.message}`)
    } else {
      console.log('Auction status updated successfully')
    }

    // Return success response
    return new Response(
      JSON.stringify({
        message: `Sent ${successCount} winner emails`,
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
