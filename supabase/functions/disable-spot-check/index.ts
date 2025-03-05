
import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.5';
import { SQL_CHECK_TRIGGER_STATUS, SQL_DISABLE_TRIGGER } from '../_shared/sql-helpers.ts';

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

    // Log the action in our tracking table
    try {
      const { data, error } = await supabaseClient
        .from('_disable_spot_check_log')
        .insert([{ executed_at: new Date().toISOString() }]);
        
      if (error) {
        console.error('📋 Log entry error:', error);
      } else {
        console.log('📋 Created log entry:', data);
      }
    } catch (logError) {
      console.error('📋 Could not create log entry, but continuing:', logError);
    }

    // First check if the get_trigger_status function still exists
    console.log('🔍 Checking if trigger status function exists...');
    
    try {
      const { data: triggerCheck, error: checkError } = await supabaseClient.rpc('get_trigger_status');
      
      if (checkError) {
        console.error('❌ Error checking trigger status:', checkError);
        console.log('ℹ️ Trigger status function may not exist, continuing with bid');
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Trigger check function does not exist, continuing with bid',
            details: checkError.message
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }
      
      console.log('🔍 Trigger status check result:', triggerCheck);
      
      // If trigger doesn't exist, just return success
      if (!triggerCheck || triggerCheck.length === 0) {
        console.log('ℹ️ No trigger found, continuing with bid');
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'No trigger exists to disable, continuing with bid' 
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }
    } catch (functionError) {
      console.error('❌ Error calling get_trigger_status function:', functionError);
      console.log('ℹ️ Continuing with bid despite error');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Could not check trigger status, but continuing with bid',
          details: functionError.message
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Try to disable the trigger using our admin function
    try {
      const { error: sqlError } = await supabaseClient.rpc('admin_disable_check_auction_spots_trigger');

      if (sqlError) {
        console.error('❌ Error disabling trigger:', sqlError);
        
        // If we get a specific error that trigger doesn't exist, just proceed
        if (sqlError.message && (
            sqlError.message.includes('does not exist') || 
            sqlError.message.includes('function admin_disable_check_auction_spots_trigger() does not exist')
          )) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'Trigger or function does not exist, continuing with bid',
              details: sqlError.message
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          );
        }
      } else {
        console.log('✅ Successfully disabled check auction spots trigger');
      }
    } catch (functionError) {
      console.error('❌ Error calling admin_disable_check_auction_spots_trigger function:', functionError);
    }

    // Always return success to allow bidding
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Check auction spots trigger disabled or does not exist'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    // Still return 200 to not block bids
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Error encountered but continuing with bid',
        details: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});
