import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    
    console.log('Pipedream webhook received:', JSON.stringify(payload, null, 2));

    const { event, connect_token, environment, connect_session_id, account, error } = payload;

    if (!connect_token) {
      console.error('Missing connect_token in webhook payload');
      return new Response(
        JSON.stringify({ error: 'Missing connect_token' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (event === 'CONNECTION_SUCCESS') {
      console.log('Processing CONNECTION_SUCCESS event');
      
      if (!account || !account.id) {
        console.error('Missing account information in success webhook');
        return new Response(
          JSON.stringify({ error: 'Missing account information' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Update integration status to connected
      // Try to match by full token first, then by token without prefix
      const tokenWithoutPrefix = connect_token.replace('ctok_', '');
      
      console.log('Attempting to update integration with token:', { connect_token, tokenWithoutPrefix });

      const { data: existingIntegrations, error: findError } = await supabase
        .from('user_integrations')
        .select('*')
        .or(`config->>token.eq.${connect_token},config->>token.eq.${tokenWithoutPrefix}`);

      if (findError) {
        console.error('Error finding integration:', findError);
      } else {
        console.log('Found integrations to update:', existingIntegrations);
      }

      const { error: updateError } = await supabase
        .from('user_integrations')
        .update({
          status: 'connected',
          config: {
            account_id: account.id,
            account_name: account.name || account.external_id,
            connect_token,
            connect_session_id,
            environment,
            connected_at: new Date().toISOString(),
            account_healthy: account.healthy
          },
          updated_at: new Date().toISOString()
        })
        .or(`config->>token.eq.${connect_token},config->>token.eq.${tokenWithoutPrefix}`);

      if (updateError) {
        console.error('Failed to update integration after SUCCESS:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update integration status' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('Integration successfully connected:', account.id);

    } else if (event === 'CONNECTION_ERROR') {
      console.log('Processing CONNECTION_ERROR event');
      
      // Update integration status to error
      const tokenWithoutPrefix = connect_token.replace('ctok_', '');
      console.log('Attempting to update integration with error for token:', { connect_token, tokenWithoutPrefix });

      const { error: updateError } = await supabase
        .from('user_integrations')
        .update({
          status: 'error',
          config: {
            connect_token,
            connect_session_id,
            environment,
            error_message: error || 'Unknown connection error',
            error_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .or(`config->>token.eq.${connect_token},config->>token.eq.${tokenWithoutPrefix}`);

      if (updateError) {
        console.error('Failed to update integration after ERROR:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update integration status' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('Integration connection failed:', error);

    } else {
      console.log('Unknown event type:', event);
      return new Response(
        JSON.stringify({ error: `Unknown event type: ${event}` }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        event,
        processed_at: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in pipedream-webhook:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});