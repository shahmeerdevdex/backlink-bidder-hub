
import Stripe from 'https://esm.sh/stripe@12.8.0?target=deno'

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  // This is needed to use fetch instead of Node's http client
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})
