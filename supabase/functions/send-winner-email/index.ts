
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { SMTPClient } from 'npm:emailjs@4.0.3'

// Initialize Supabase client with admin privileges
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Base URL for auction links
const baseUrl = 'https://auction.elegantmentions.com'

// Initialize SMTP client with updated connection settings
const smtpClient = new SMTPClient({
  user: 'sabina@elegantmentions.com',
  password: 'cjiaXnh5piNh!nj',
  host: 'mail.privateemail.com',
  port: 465,
  ssl: true,
  timeout: 60000  // Increase timeout to 60 seconds
})

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('⚡ [INVOKED] send-winner-email function started')
  console.log('SMTP client configured:', !!smtpClient)
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
    const { winnerId, auctionId } = requestData
    
    console.log(`Processing request with winnerId: ${winnerId}, auctionId: ${auctionId}`)
    
    if (!winnerId && !auctionId) {
      console.error('Missing required parameters: either winnerId or auctionId must be provided')
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: either winnerId or auctionId must be provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let auction;
    let winners = [];

    // If winnerId is provided, get specific winner details and corresponding auction
    if (winnerId) {
      console.log(`Fetching winner details for ID: ${winnerId}`)
      const { data: winner, error: winnerError } = await supabase
        .from('auction_winners')
        .select('*, auctions(*)')
        .eq('id', winnerId)
        .single()

      if (winnerError) {
        console.error(`Error fetching winner: ${winnerError.message}`)
        return new Response(
          JSON.stringify({ error: `Error fetching winner: ${winnerError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Winner data retrieved:`, winner)
      auction = winner.auctions
      winners = [winner]
    } 
    // If auctionId is provided, get auction details and all its winners
    else if (auctionId) {
      console.log(`Fetching auction details for ID: ${auctionId}`)
      const { data: auctionData, error: auctionError } = await supabase
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

      console.log(`Auction data retrieved:`, auctionData)
      auction = auctionData;
      
      // Get all winners for this auction
      console.log(`Fetching winners for auction ID: ${auctionId}`)
      const { data: auctionWinners, error: winnersError } = await supabase
        .from('auction_winners')
        .select('*')
        .eq('auction_id', auctionId)
        .eq('status', 'pending_payment')
      
      if (winnersError) {
        console.error(`Error fetching auction winners: ${winnersError.message}`)
        return new Response(
          JSON.stringify({ error: `Error fetching auction winners: ${winnersError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log(`Found ${auctionWinners.length} winners for auction ${auctionId}`)
      winners = auctionWinners
    }

    if (!winners || winners.length === 0) {
      console.log('No winners found to notify')
      return new Response(
        JSON.stringify({ message: 'No winners found to notify', successCount: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create auction page URL
    const auctionPageUrl = `${baseUrl}/auctions/${auction.id}`;
    
    // Process each winner
    let successCount = 0
    const emailPromises = []
    
    for (const winner of winners) {
      // Check if email notification flag is already set
      const { data: emailSentCheck, error: emailCheckError } = await supabase
        .from('auction_winners')
        .select('email_sent')
        .eq('id', winner.id)
        .single();
      
      if (emailCheckError) {
        console.error(`Error checking email sent status: ${emailCheckError.message}`);
        continue;
      }
      
      if (emailSentCheck && emailSentCheck.email_sent) {
        console.log(`Email already sent for winner ${winner.id}, skipping`);
        successCount++; // Count as success since the email was previously sent
        continue;
      }
      
      // Get user details for email
      console.log(`Fetching user details for user ID: ${winner.user_id}`)
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(winner.user_id)

      if (userError) {
        console.error(`Error fetching user with ID ${winner.user_id}: ${userError.message}`)
        continue
      }

      if (!userData || !userData.user || !userData.user.email) {
        console.error(`No email found for user with ID ${winner.user_id}`)
        continue
      }

      const userEmail = userData.user.email
      console.log(`Processing email to: ${userEmail}`)

      // Fetch the bid amount for this winner
      console.log(`Fetching bid details for ID: ${winner.winning_bid_id}`)
      const { data: bidData, error: bidError } = await supabase
        .from('bids')
        .select('amount')
        .eq('id', winner.winning_bid_id)
        .single()
        
      if (bidError) {
        console.error(`Error fetching bid: ${bidError.message}`)
        continue
      }
      
      const bidAmount = bidData ? bidData.amount : 'unknown'
      console.log(`Bid amount: $${bidAmount}`)

      // Prepare email content
      const emailPromise = smtpClient.sendAsync({
        from: 'EM Auction System <sabina@elegantmentions.com>',
        to: userEmail,
        subject: `Congratulations! You've won the auction: ${auction.title}`,
        text: `Congratulations! You are one of the winning bidders for the auction: ${auction.title}. Your winning bid amount: $${bidAmount}. Please log in to your account to complete the payment process within 24 hours. You can view the auction and complete payment here: ${auctionPageUrl} Thank you for participating!`,
        attachment: [
          {
            data: `
              <h1>Congratulations!</h1>
              <p>You are one of the winning bidders for the auction: <strong>${auction.title}</strong></p>
              <p>Your winning bid amount: <strong>$${bidAmount}</strong></p>
              <p>Please log in to your account to complete the payment process within 24 hours.</p>
              <p><a href="${auctionPageUrl}" style="background-color: #1a73e8; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">Complete Payment</a></p>
              <p>Thank you for participating!</p>
            `,
            alternative: true
          }
        ]
      })
        .then(async result => {
          console.log(`Email sent successfully to ${userEmail}, result:`, result)
          
          // Mark this winner as having received an email
          await supabase
            .from('auction_winners')
            .update({ email_sent: true })
            .eq('id', winner.id);
          
          // Create notification in database
          return supabase
            .from('notifications')
            .insert({
              user_id: winner.user_id,
              type: 'winner',
              message: `You've won the auction: ${auction.title} with a bid of $${bidAmount}`,
              auction_id: auction.id
            })
            .then(({ error: notificationError }) => {
              if (notificationError) {
                console.error(`Error creating notification: ${notificationError.message}`)
              } else {
                console.log(`Notification created for user ${winner.user_id}`)
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
    successCount += results.filter(r => r.success).length
    console.log(`Successfully sent ${successCount} emails`)

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
