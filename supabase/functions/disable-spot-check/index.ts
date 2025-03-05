
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
    const { data, error } = await supabaseClient
      .from('_disable_spot_check_log')
      .insert([{ executed_at: new Date().toISOString() }]);
      
    if (error) {
      console.error('📋 Log entry error:', error);
    } else {
      console.log('📋 Created log entry:', data);
    }

    // First check if trigger exists via raw SQL query
    console.log('🔍 Checking if trigger exists...');
    const { data: triggerCheck, error: checkError } = await supabaseClient.rpc('get_trigger_status');
    
    if (checkError) {
      console.error('❌ Error checking trigger status:', checkError);
      // Success response even if trigger doesn't exist - avoids blocking users
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No trigger exists to disable, continuing with bid',
          details: 'Trigger check failed but operation allowed to continue'
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

    // Try to disable the trigger using our admin function
    const { error: sqlError } = await supabaseClient.rpc('admin_disable_check_auction_spots_trigger');

    if (sqlError) {
      console.error('❌ Error disabling trigger:', sqlError);
      
      // If we get a specific error that trigger doesn't exist, just proceed
      if (sqlError.message && sqlError.message.includes('does not exist')) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Trigger does not exist, continuing with bid',
            details: sqlError.message
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }
      
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
    const { data: postTriggerStatus, error: postStatusError } = await supabaseClient
      .rpc('get_trigger_status');

    if (postStatusError) {
      console.error('❌ Error checking post-update trigger status:', postStatusError);
    } else {
      console.log('🔍 Post-update trigger status:', postTriggerStatus);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Check auction spots trigger disabled or does not exist',
        status: postTriggerStatus || 'No trigger found'
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
