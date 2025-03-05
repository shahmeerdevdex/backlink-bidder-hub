
import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  console.log('🔧 Starting disable-spot-check function');
  
  try {
    // Create a Supabase client with the service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    console.log('💾 Connected to Supabase');

    // Directly execute SQL to disable the trigger
    // This is more reliable than using RPC
    const { data, error } = await supabaseClient
      .from('_disable_spot_check_log')
      .insert([{ executed_at: new Date().toISOString() }]);
      
    if (error) {
      console.error('📋 Log entry error:', error);
    } else {
      console.log('📋 Created log entry:', data);
    }

    // Execute the raw SQL to disable the trigger
    const { error: sqlError } = await supabaseClient.rpc('admin_disable_check_auction_spots_trigger');

    if (sqlError) {
      console.error('❌ Error disabling trigger:', sqlError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to disable check auction spots trigger',
          details: sqlError
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    console.log('✅ Successfully disabled check auction spots trigger');

    // Verify the trigger is disabled
    const { data: triggerStatus, error: statusError } = await supabaseClient
      .rpc('get_trigger_status');

    if (statusError) {
      console.error('❌ Error checking trigger status:', statusError);
    } else {
      console.log('🔍 Trigger status:', triggerStatus);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Check auction spots trigger disabled',
        status: triggerStatus 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error',
        details: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
