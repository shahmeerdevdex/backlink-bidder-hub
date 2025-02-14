
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

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        
        // Update payment record
        const { error: updateError } = await supabaseClient
          .from('payments')
          .update({
            status: 'completed',
            stripe_payment_id: session.payment_intent,
            updated_at: new Date().toISOString()
          })
          .eq('stripe_session_id', session.id)

        if (updateError) {
          throw updateError
        }

        // Update bid status
        if (session.client_reference_id) {
          const { error: bidError } = await supabaseClient
            .from('bids')
            .update({
              status: 'paid',
              updated_at: new Date().toISOString()
            })
            .eq('id', session.client_reference_id)

          if (bidError) {
            throw bidError
          }
        }

        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object
        
        // Update payment record
        const { error: updateError } = await supabaseClient
          .from('payments')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_session_id', session.id)

        if (updateError) {
          throw updateError
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
