
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { stripe } from '../_shared/stripe.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      throw new Error('No Stripe signature found')
    }

    const body = await req.text()
    let event

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        STRIPE_WEBHOOK_SECRET
      )
    } catch (err) {
      console.error(`⚠️ Webhook signature verification failed.`, err.message)
      return new Response(JSON.stringify({ error: err.message }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      })
    }

    console.log(`✅ Received Stripe event: ${event.type}`)

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        console.log(`Processing completed checkout session: ${session.id}`)
        
        // Update payment record
        const { data: paymentData, error: updateError } = await supabaseClient
          .from('payments')
          .update({
            status: 'completed',
            stripe_payment_id: session.payment_intent,
            updated_at: new Date().toISOString()
          })
          .eq('stripe_session_id', session.id)
          .select('bid_id')

        if (updateError) {
          console.error('Error updating payment:', updateError)
          throw updateError
        }

        console.log(`Updated payment for session ${session.id}`)
        
        // Update bid status
        const bidId = session.client_reference_id || (paymentData && paymentData[0]?.bid_id)
        
        if (bidId) {
          console.log(`Updating bid ${bidId} status to paid`)
          const { data: bidData, error: bidError } = await supabaseClient
            .from('bids')
            .update({
              status: 'paid',
              updated_at: new Date().toISOString()
            })
            .eq('id', bidId)
            .select('user_id, auction_id')

          if (bidError) {
            console.error('Error updating bid:', bidError)
            throw bidError
          }
          
          // Update auction winner status if applicable
          if (bidData && bidData[0]) {
            console.log(`Updating auction winner status for user ${bidData[0].user_id} in auction ${bidData[0].auction_id}`)
            await supabaseClient
              .from('auction_winners')
              .update({
                status: 'paid',
                updated_at: new Date().toISOString()
              })
              .eq('winning_bid_id', bidId)
              .eq('user_id', bidData[0].user_id)
              .eq('auction_id', bidData[0].auction_id)
          }
          
          // Create notification for successful payment
          if (bidData && bidData[0] && bidData[0].user_id) {
            await supabaseClient.rpc('create_notification', {
              p_user_id: bidData[0].user_id,
              p_type: 'payment_success',
              p_message: 'Your payment has been successfully processed!'
            })
          }
        }

        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object
        console.log(`Processing expired checkout session: ${session.id}`)
        
        // Update payment record
        const { error: updateError } = await supabaseClient
          .from('payments')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_session_id', session.id)

        if (updateError) {
          console.error('Error updating payment:', updateError)
          throw updateError
        }
        break
      }
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object
        console.log(`Payment intent succeeded: ${paymentIntent.id}`)
        
        // Update payment status if it hasn't been updated already
        const { error } = await supabaseClient
          .from('payments')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_payment_intent_id', paymentIntent.id)
          .is('status', 'pending')

        if (error) {
          console.error('Error updating payment from payment intent:', error)
        }
        
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to process webhook' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
