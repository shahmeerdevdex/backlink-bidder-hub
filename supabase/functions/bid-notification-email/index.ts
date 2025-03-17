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
  port: 587, // Using TLS port
  tls: true, // Enable TLS instead of SSL
})

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
    let { bidId, auctionId, notifyAllUsers, outbidUserId } = requestData
    
    console.log(`Processing notification with: bidId: ${bidId}, auctionId: ${auctionId}, notifyAllUsers: ${notifyAllUsers}, outbidUserId: ${outbidUserId}`)
    
    if (!bidId && !auctionId) {
      console.error('Missing required parameters: either bidId or auctionId must be provided')
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: either bidId or auctionId must be provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let auction;
    let bidder;
    let bidderEmail;
    let newBidAmount;

    // If we have a bid ID, get bid and auction details from it
    if (bidId) {
      console.log(`Fetching bid details for ID: ${bidId}`)
      const { data: bid, error: bidError } = await supabase
        .from('bids')
        .select('id, amount, auction_id, user_id')
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
      newBidAmount = bid.amount;
      
      // Get auction details
      console.log(`Fetching auction details for ID: ${bid.auction_id}`)
      const { data: auctionData, error: auctionError } = await supabase
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

      console.log(`Auction data retrieved:`, auctionData)
      auction = auctionData;
      
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

      bidderEmail = bidderData.user?.email || 'Unknown bidder'
      bidder = bid.user_id;
      console.log(`Bidder email: ${bidderEmail}`)

      // Check if this is the first bid in the auction (created by auction creator)
      if (bid.user_id === auction.creator_id && !notifyAllUsers) {
        console.log('This is a bid by the auction creator, setting notifyAllUsers to true')
        notifyAllUsers = true;
      }
    } else if (auctionId) {
      // If we have an auction ID, get auction details directly
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
      newBidAmount = auction.current_price;

      // Get creator details
      console.log(`Fetching creator details for ID: ${auction.creator_id}`)
      const { data: creatorData, error: creatorError } = await supabase.auth.admin.getUserById(auction.creator_id)

      if (creatorError) {
        console.error(`Error fetching creator: ${creatorError.message}`)
        return new Response(
          JSON.stringify({ error: `Error fetching creator: ${creatorError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      bidderEmail = creatorData.user?.email || 'Unknown creator'
      bidder = auction.creator_id;
      console.log(`Creator email: ${bidderEmail}`)
      
      // For direct auction notification, always notify all users if notifyAllUsers is true
      // Explicitly force notifyAllUsers to true for new auctions
      console.log("Processing auction ID directly, ensuring notifyAllUsers is true");
      notifyAllUsers = true;
    }

    // Handle outbid notification specifically if outbidUserId is provided
    if (outbidUserId) {
      console.log(`Processing outbid notification for user: ${outbidUserId}`)
      
      // Check if the outbid user is still in a winning position
      const allBids = await supabase
        .from('bids')
        .select('user_id, amount')
        .eq('auction_id', auction.id)
        .eq('status', 'active')
        .order('amount', { ascending: false })
        
      if (allBids.error) {
        console.error(`Error fetching bids: ${allBids.error.message}`)
        return new Response(
          JSON.stringify({ error: `Error fetching bids: ${allBids.error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Get user details of the outbid user
      console.log(`Fetching outbid user details for ID: ${outbidUserId}`)
      const { data: outbidUserData, error: outbidUserError } = await supabase.auth.admin.getUserById(outbidUserId)

      if (outbidUserError) {
        console.error(`Error fetching outbid user: ${outbidUserError.message}`)
        return new Response(
          JSON.stringify({ error: `Error fetching outbid user: ${outbidUserError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const outbidUserEmail = outbidUserData.user?.email
      if (!outbidUserEmail) {
        console.error(`No email found for outbid user: ${outbidUserId}`)
        return new Response(
          JSON.stringify({ error: `No email found for outbid user: ${outbidUserId}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Get the highest bid of the outbid user
      const userHighestBid = allBids.data
        .filter(bid => bid.user_id === outbidUserId)
        .sort((a, b) => b.amount - a.amount)[0]
      
      // Check if user is still in a winning position (top X bidders where X is max_spots)
      const topBidders = new Set()
      const uniqueBidders = new Map()
      
      for (const bid of allBids.data) {
        if (!uniqueBidders.has(bid.user_id) || uniqueBidders.get(bid.user_id) < bid.amount) {
          uniqueBidders.set(bid.user_id, bid.amount)
        }
      }
      
      // Sort by bid amount and take top max_spots
      Array.from(uniqueBidders.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, auction.max_spots)
        .forEach(([userId]) => {
          topBidders.add(userId)
        })
      
      const isStillInWinningPosition = topBidders.has(outbidUserId)
      
      // Get the minimum winning bid amount
      const minWinningBid = Array.from(uniqueBidders.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, auction.max_spots)
        .pop()?.[1] || 0
      
      console.log(`Sending outbid notification to: ${outbidUserEmail}`)
      console.log(`User is${isStillInWinningPosition ? '' : ' not'} in a winning position`)
      console.log(`Minimum winning bid amount: ${minWinningBid}`)
      
      try {
        const emailResult = await smtpClient.sendAsync({
          from: 'Auction System <shahmeerhussainkhadmi@gmail.com>',
          to: outbidUserEmail,
          subject: `You've been outbid on auction: ${auction.title}`,
          text: `You've been outbid on the auction: ${auction.title}.
            New highest bid: $${newBidAmount}.
            ${isStillInWinningPosition 
              ? `You're still in a winning position! Your highest bid of $${userHighestBid?.amount || 0} still secures you a spot in the top ${auction.max_spots} bidders.` 
              : `You're no longer in a winning position. Your highest bid of $${userHighestBid?.amount || 0} is below the current minimum winning bid of $${minWinningBid}.`}
            ${!isStillInWinningPosition ? `You need to place a new bid of at least $${minWinningBid + 1} to secure a spot again.` : ''}
            Please check the auction for more details.`,
          attachment: [
            {
              data: `
                <h1>You've Been Outbid!</h1>
                <p>Someone has placed a higher bid on the auction: <strong>${auction.title}</strong></p>
                <p>New highest bid: <strong>$${newBidAmount}</strong></p>
                ${isStillInWinningPosition 
                  ? `<div style="background-color: #e6f4ea; padding: 10px; border-radius: 4px; margin: 15px 0;">
                      <h3 style="color: #137333; margin-top: 0;">You're Still in a Winning Position!</h3>
                      <p>Your highest bid of <strong>$${userHighestBid?.amount || 0}</strong> still secures you a spot in the top ${auction.max_spots} bidders.</p>
                      <p>Continue monitoring the auction to ensure you maintain your position.</p>
                    </div>` 
                  : `<div style="background-color: #fce8e6; padding: 10px; border-radius: 4px; margin: 15px 0;">
                      <h3 style="color: #c5221f; margin-top: 0;">You're No Longer in a Winning Position</h3>
                      <p>Your highest bid of <strong>$${userHighestBid?.amount || 0}</strong> is below the current minimum winning bid of <strong>$${minWinningBid}</strong>.</p>
                      <p>You need to place a new bid of at least <strong>$${minWinningBid + 1}</strong> to secure a spot again.</p>
                      <p><a href="${Deno.env.get('PUBLIC_URL') || ''}/auction/${auction.id}" style="background-color: #1a73e8; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">Place New Bid</a></p>
                    </div>`}
                <p>Auction details:</p>
                <ul>
                  <li>Description: ${auction.description}</li>
                  <li>Starting price: $${auction.starting_price}</li>
                  <li>Current highest bid: $${newBidAmount}</li>
                  <li>Your highest bid: $${userHighestBid?.amount || 0}</li>
                </ul>
                <p>Thank you for participating!</p>
              `,
              alternative: true
            }
          ]
        });
        
        console.log(`Outbid email sent to ${outbidUserEmail}:`, emailResult);
        
        // Create notification in database
        await supabase
          .from('notifications')
          .insert({
            user_id: outbidUserId,
            type: 'outbid',
            message: `You've been outbid on auction: ${auction.title}. New highest bid: $${newBidAmount}.`,
            auction_id: auction.id
          });
        
        return new Response(
          JSON.stringify({
            message: `Outbid notification email sent to ${outbidUserEmail}`,
            success: true
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error(`Error sending outbid email to ${outbidUserEmail}:`, error);
        return new Response(
          JSON.stringify({ error: `Error sending outbid email: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If notifyAllUsers is true, notify all users
    if (notifyAllUsers) {
      console.log('notifyAllUsers is true, notifying all users about the auction')
      
      // Get all users from profiles
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email')
      
      if (profilesError) {
        console.error(`Error fetching profiles: ${profilesError.message}`)
        return new Response(
          JSON.stringify({ error: `Error fetching profiles: ${profilesError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log(`Found ${allProfiles.length} users to notify about new auction`)
      
      const emailPromises = []
      
      // Send email to all users about the new auction
      for (const profile of allProfiles) {
        if (!profile.email) {
          console.log(`Skipping profile ${profile.id} because it has no email`)
          continue
        }
        
        console.log(`Preparing to send email to: ${profile.email} about new auction`)
        
        const emailPromise = smtpClient.sendAsync({
          from: 'Auction System <shahmeerhussainkhadmi@gmail.com>',
          to: profile.email,
          subject: `New Auction Created: ${auction.title}`,
          text: `A new auction has been created: ${auction.title}. 
            Description: ${auction.description}. 
            Starting price: $${auction.starting_price}. 
            Maximum spots: ${auction.max_spots}. 
            End date: ${new Date(auction.ends_at).toLocaleString()}.
            Don't miss your chance to bid on this exciting auction!`,
          attachment: [
            {
              data: `
                <h1>New Auction Alert!</h1>
                <p>A new auction has been created: <strong>${auction.title}</strong></p>
                <p>Auction details:</p>
                <ul>
                  <li>Description: ${auction.description}</li>
                  <li>Starting price: $${auction.starting_price}</li>
                  <li>Maximum spots: ${auction.max_spots}</li>
                  <li>End date: ${new Date(auction.ends_at).toLocaleString()}</li>
                </ul>
                <p>Don't miss your chance to bid on this exciting auction!</p>
                <p>Thank you for using our auction system!</p>
              `,
              alternative: true
            }
          ]
        })
          .then(result => {
            console.log(`Email sent successfully to ${profile.email}, result:`, result)
            
            // Create notification in database for all users except creator
            if (profile.id !== bidder) {
              return supabase
                .from('notifications')
                .insert({
                  user_id: profile.id,
                  type: 'new_auction',
                  message: `New auction created: ${auction.title}`,
                  auction_id: auction.id
                })
                .then(({ error: notificationError }) => {
                  if (notificationError) {
                    console.error(`Error creating notification: ${notificationError.message}`)
                  } else {
                    console.log(`Notification created for user ${profile.id}`)
                  }
                  return { success: true, email: profile.email }
                })
            }
            
            return { success: true, email: profile.email }
          })
          .catch(error => {
            console.error(`Error sending email to ${profile.email}: ${error.message}`)
            return { success: false, email: profile.email, error: error.message }
          })
        
        emailPromises.push(emailPromise)
      }
      
      // Send special email to the auction creator
      try {
        console.log(`Sending special email to creator: ${bidderEmail}`)
        const creatorEmailResult = await smtpClient.sendAsync({
          from: 'Auction System <shahmeerhussainkhadmi@gmail.com>',
          to: bidderEmail,
          subject: `Your auction "${auction.title}" has been created`,
          text: `Your auction "${auction.title}" has been successfully created.
            Description: ${auction.description}.
            Starting price: $${auction.starting_price}.
            Maximum spots: ${auction.max_spots}.
            You will receive notifications when users place bids on your auction.
            Thank you for using our auction system!`,
          attachment: [
            {
              data: `
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
              `,
              alternative: true
            }
          ]
        });

        console.log(`Special email sent to creator (${bidderEmail}):`, creatorEmailResult);
      } catch (error) {
        console.error(`Error sending special email to creator: ${error.message}`);
      }
      
      // Wait for all emails to be sent
      if (emailPromises.length === 0) {
        console.log("No emails to send - all users might be missing email addresses");
        return new Response(
          JSON.stringify({
            message: "No users with email addresses found to notify",
            successCount: 0
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      console.log(`Waiting for ${emailPromises.length} emails to be sent`)
      const results = await Promise.all(emailPromises)
      console.log(`Email sending results:`, results)
      
      // Count successful emails
      const successCount = results.filter(r => r.success).length
      console.log(`Successfully sent ${successCount} emails`)
      
      return new Response(
        JSON.stringify({
          message: `Sent ${successCount} notification emails about new auction`,
          successCount,
          results
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // For regular bids, get all unique bidders for this auction (except the current bidder)
    console.log(`Fetching all bidders for auction ID: ${auction.id}`)
    const { data: uniqueBidders, error: biddersError } = await supabase
      .from('bids')
      .select('user_id')
      .eq('auction_id', auction.id)
      .eq('status', 'active')
      .neq('user_id', bidder) // Exclude the current bidder
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
      const emailPromise = smtpClient.sendAsync({
        from: 'Auction System <shahmeerhussainkhadmi@gmail.com>',
        to: userEmail,
        subject: `New bid placed on auction: ${auction.title}`,
        text: `A new bid has been placed on the auction: ${auction.title}.
          New bid amount: $${bidId ? requestData.amount : auction.current_price}.
          Auction description: ${auction.description}.
          Starting price: $${auction.starting_price}.
          Current highest bid: $${auction.current_price}.
          Your position may have changed. Please log in to check your status.`,
        attachment: [
          {
            data: `
              <h1>New Bid Alert!</h1>
              <p>A new bid has been placed on the auction: <strong>${auction.title}</strong></p>
              <p>New bid amount: <strong>$${bidId ? requestData.amount : auction.current_price}</strong></p>
              <p>Auction details:</p>
              <ul>
                <li>Description: ${auction.description}</li>
                <li>Starting price: $${auction.starting_price}</li>
                <li>Current highest bid: $${auction.current_price}</li>
              </ul>
              <p>Your position may have changed. Please log in to check your status.</p>
              <p>Thank you for participating!</p>
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
              user_id: bidderId,
              type: 'new_bid',
              message: `New bid of $${bidId ? requestData.amount : auction.current_price} placed on auction: ${auction.title}`,
              auction_id: auction.id
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
