
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { stripe } from '../_shared/stripe.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { bidId } = await req.json()

    console.log('Processing bid:', bidId)

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get bid details with user email
    const { data: bid, error: bidError } = await supabaseClient
      .from('bids')
      .select(`
        id,
        amount,
        user_id,
        auction:auctions (
          title,
          description
        ),
        user:profiles!bids_user_id_fkey (
          email
        )
      `)
      .eq('id', bidId)
      .single()

    if (bidError) {
      console.error('Bid fetch error:', bidError)
      throw new Error('Bid not found')
    }

    if (!bid) {
      console.error('No bid found for ID:', bidId)
      throw new Error('Bid not found')
    }

    if (!bid.user?.email) {
      console.error('No email found for user:', bid.user_id)
      throw new Error('User email not found')
    }

    console.log('Creating Stripe session for bid:', bid)

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: bid.auction.title,
              description: bid.auction.description || undefined,
            },
            unit_amount: Math.round(bid.amount * 100), // Convert to cents and ensure integer
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/payment/cancel`,
      client_reference_id: bidId,
      customer_email: bid.user.email, // Use the email from the profiles table
    })

    console.log('Stripe session created:', session.id)

    // Create payment record
    const { error: paymentError } = await supabaseClient
      .from('payments')
      .insert([
        {
          bid_id: bidId,
          user_id: bid.user_id,
          amount: bid.amount,
          status: 'pending',
          stripe_session_id: session.id,
        }
      ])

    if (paymentError) {
      console.error('Payment record creation error:', paymentError)
      throw new Error('Failed to create payment record')
    }

    return new Response(
      JSON.stringify({ sessionId: session.id, sessionUrl: session.url }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in create-checkout-session:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
