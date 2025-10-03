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
    const { user_id, integration_type, webhook_url, integration_name } = await req.json();

    if (!user_id || !integration_type || !webhook_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get the Authorization header from the request
    const authToken = req.headers.get('authorization')?.replace('Bearer ', '');
    
    // Initialize Supabase client with the user's token
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    });

    // Verify user is authenticated by getting their info
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Verify the user_id matches the authenticated user
    if (user.id !== user_id) {
      return new Response(
        JSON.stringify({ error: 'User ID mismatch' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create Pipedream Connect token
    const pipedreamClientId = Deno.env.get('PIPEDREAM_CLIENT_ID');
    const pipedreamClientSecret = Deno.env.get('PIPEDREAM_CLIENT_SECRET');
    const pipedreamProjectId = Deno.env.get('PIPEDREAM_PROJECT_ID');
    const pipedreamEnvironment = Deno.env.get('PIPEDREAM_ENVIRONMENT') || 'production';

    console.log('Environment variables check:', {
      hasClientId: !!pipedreamClientId,
      hasClientSecret: !!pipedreamClientSecret,
      hasProjectId: !!pipedreamProjectId,
      environment: pipedreamEnvironment
    });

    if (!pipedreamClientId || !pipedreamClientSecret || !pipedreamProjectId) {
      return new Response(
        JSON.stringify({ 
          error: 'Pipedream credentials not configured',
          debug: {
            hasClientId: !!pipedreamClientId,
            hasClientSecret: !!pipedreamClientSecret,
            hasProjectId: !!pipedreamProjectId
          }
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Declare variables outside try block
    let token: string;
    let connectLinkUrl: string | undefined;
    
    try {
      console.log('Getting Pipedream OAuth access token...');
      
      // Step 1: Get OAuth access token using client credentials
      const oauthResponse = await fetch('https://api.pipedream.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: pipedreamClientId,
          client_secret: pipedreamClientSecret
        })
      });

      if (!oauthResponse.ok) {
        const errorData = await oauthResponse.text();
        console.error('OAuth token request failed:', errorData);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to get Pipedream OAuth token',
            debug: errorData,
            status: oauthResponse.status
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const oauthData = await oauthResponse.json();
      const accessToken = oauthData.access_token;
      
      if (!accessToken) {
        console.error('No access token received from OAuth:', oauthData);
        return new Response(
          JSON.stringify({ 
            error: 'No access token returned from Pipedream OAuth',
            debug: oauthData
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('OAuth access token obtained, creating Connect token...');
      
      const webhookUri = `${supabaseUrl}/functions/v1/pipedream-webhook`;
      console.log('Using webhook URI:', webhookUri);
      
      // Step 2: Create Connect token using the OAuth access token
      const tokenResponse = await fetch(`https://api.pipedream.com/v1/connect/${pipedreamProjectId}/tokens`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-PD-Environment': pipedreamEnvironment
        },
        body: JSON.stringify({
          external_user_id: user_id,
          webhook_uri: webhookUri,
          metadata: {
            integration_type,
            webhook_url,
            integration_name
          }
        })
      });

      console.log('Pipedream Connect API response status:', tokenResponse.status);

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('Pipedream Connect token creation failed:', errorData);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to create Pipedream Connect token',
            debug: errorData,
            status: tokenResponse.status
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const tokenData = await tokenResponse.json();
      token = tokenData.token;
      connectLinkUrl = tokenData.connect_link_url || tokenData.connectLinkUrl;
      
      console.log('Pipedream Connect token created successfully');
      console.log('Token data:', JSON.stringify(tokenData, null, 2));
      console.log('Extracted connectLinkUrl:', connectLinkUrl);

      if (!token) {
        return new Response(
          JSON.stringify({ 
            error: 'No token returned from Pipedream Connect',
            debug: tokenData
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    } catch (pipedreamError) {
      console.error('Pipedream API error:', pipedreamError);
      return new Response(
        JSON.stringify({ 
          error: 'Pipedream API request failed',
          debug: pipedreamError.message
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Generate Connect URL - use API-provided URL if available, otherwise construct it
    const appName = integration_type === 'typeform' ? 'typeform' : 'google_forms';
    let connectUrl: string;
    
    if (connectLinkUrl) {
      // Use the URL provided by Pipedream API and add the app parameter
      connectUrl = `${connectLinkUrl}&app=${appName}&external_user_id=${user_id}&redirect_uri=${encodeURIComponent(`${req.headers.get('origin')}/integrations/callback`)}&state=${encodeURIComponent(JSON.stringify({ user_id, webhook_url, integration_name }))}`;
      console.log('Using API-provided Connect URL:', connectUrl);
    } else {
      // Fallback to constructed URL with corrected domain
      connectUrl = `https://pipedream.com/connect/oauth/accounts?` + 
        new URLSearchParams({
          app: appName,
          token: token,
          external_user_id: user_id,
          redirect_uri: `${req.headers.get('origin')}/integrations/callback`,
          state: JSON.stringify({ user_id, webhook_url, integration_name })
        });
      console.log('Using constructed Connect URL:', connectUrl);
    }

    // Store integration metadata in database
    const integration_id = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from('user_integrations')
      .insert({
        id: integration_id,
        user_id,
        type: integration_type,
        name: integration_name,
        status: 'pending',
        config: {
          webhook_url,
          token,
          app_name: appName
        }
      });

    if (insertError) {
      console.error('Failed to store integration:', insertError);
      // Continue anyway - the integration can still work without DB storage
    }

    return new Response(
      JSON.stringify({
        connect_url: connectUrl,
        integration_id,
        token
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in pipedream-setup-integration:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});