
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { SMTPClient } from 'npm:emailjs@4.0.3'

// Initialize Supabase client with admin privileges
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Initialize SMTP client for Private Email
const smtpClient = new SMTPClient({
  user: 'sabina@elegantmentions.com',
  password: 'cjiaXnh5piNh!nj',
  host: 'mail.privateemail.com',
  port: 465, // Using SSL port
  ssl: true,
})

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Email signature
const emailSignature = `
<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
  <table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; color: #333;">
    <tr>
      <td valign="top" style="padding-right: 15px;">
        <img src="https://eleganmentions.com/public/lovable-uploads/b7704d15-73fd-490e-891c-0f6d44db75a7.png" alt="Sabina" width="80" style="border-radius: 5px;">
      </td>
      <td valign="top">
        <p style="margin: 0; font-weight: bold; font-size: 16px;">EM Auctions Team</p>
        <p style="margin: 3px 0; font-size: 14px;">Elegant Mentions</p>
        <p style="margin: 3px 0; font-size: 14px;">
          <a href="mailto:sabina@elegantmentions.com" style="color: #2754C5; text-decoration: none;">sabina@elegantmentions.com</a>
        </p>
        <p style="margin: 3px 0; font-size: 14px;">
          <a href="tel:+13474977079" style="color: #2754C5; text-decoration: none;">+1 347 497 7079</a>
        </p>
        <p style="margin: 3px 0; font-size: 14px;">
          <a href="https://elegantmentions.com" style="color: #2754C5; text-decoration: none;">elegantmentions.com</a>
        </p>
      </td>
    </tr>
  </table>
</div>
`;

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
      const emailPromise = smtpClient.sendAsync({
        from: 'Auction System <sabina@elegantmentions.com>',
        to: userEmail,
        subject: `Congratulations! You've won the auction: ${auction.title}`,
        text: `Congratulations! You are one of the winning bidders for the auction: ${auction.title}. Your winning bid amount: $${bid.amount}. Please log in to your account to complete the payment process within 24 hours. Thank you for participating!`,
        attachment: [
          {
            data: `
              <h1>Congratulations!</h1>
              <p>You are one of the winning bidders for the auction: <strong>${auction.title}</strong></p>
              <p>Your winning bid amount: <strong>$${bid.amount}</strong></p>
              <p>Please log in to your account to complete the payment process within 24 hours.</p>
              <p>Thank you for participating!</p>
              ${emailSignature}
            `,
            alternative: true
          }
        ]
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
