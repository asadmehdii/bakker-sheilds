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

  // Handle GET requests for health checks
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'pipedream-webhook'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const payload = await req.json();

    // Basic request diagnostics (without sensitive headers)
    const url = new URL(req.url);
    console.log('[PD] Webhook request meta:', {
      method: req.method,
      path: url.pathname,
      search: url.search,
      contentType: req.headers.get('content-type'),
      userAgent: req.headers.get('user-agent'),
    });
    console.log('[PD] Raw payload:', JSON.stringify(payload, null, 2));

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

    // Normalize event type to broaden compatibility with Pipedream variations
    const eventNorm = (typeof event === 'string' ? event : '').toUpperCase();
    const isSuccessEvent = eventNorm === 'CONNECTION_SUCCESS' || eventNorm === 'ACCOUNT_CONNECTED' || eventNorm.includes('SUCCESS');
    const isErrorEvent = eventNorm === 'CONNECTION_ERROR' || eventNorm.includes('ERROR') || eventNorm === 'ACCOUNT_CONNECTION_FAILED';

    if (isSuccessEvent) {
      console.log('[PD] Processing SUCCESS event:', { event, eventNorm, environment, connect_session_id });
      
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
      // Try multiple token matching strategies
      const tokenWithoutPrefix = connect_token.replace('ctok_', '');
      const tokenWithPrefix = connect_token.startsWith('ctok_') ? connect_token : `ctok_${connect_token}`;

      console.log('[PD] Looking up integration by token:', { 
        connect_token, 
        tokenWithoutPrefix, 
        tokenWithPrefix,
        search_strategies: ['exact_match', 'without_prefix', 'with_prefix']
      });

      // Try multiple search strategies
      let existingIntegrations: any[] = [];
      let findError: any = null;

      // Strategy 1: Exact match
      let { data: exactMatch, error: exactError } = await supabase
        .from('user_integrations')
        .select('id, user_id, type, status, config, created_at, updated_at')
        .eq('config->>token', connect_token);

      if (exactMatch && exactMatch.length > 0) {
        existingIntegrations = exactMatch;
        console.log('[PD] Found exact token match:', exactMatch.length);
      } else {
        // Strategy 2: Without prefix
        let { data: noPrefixMatch, error: noPrefixError } = await supabase
          .from('user_integrations')
          .select('id, user_id, type, status, config, created_at, updated_at')
          .eq('config->>token', tokenWithoutPrefix);

        if (noPrefixMatch && noPrefixMatch.length > 0) {
          existingIntegrations = noPrefixMatch;
          console.log('[PD] Found token match without prefix:', noPrefixMatch.length);
        } else {
          // Strategy 3: With prefix
          let { data: withPrefixMatch, error: withPrefixError } = await supabase
            .from('user_integrations')
            .select('id, user_id, type, status, config, created_at, updated_at')
            .eq('config->>token', tokenWithPrefix);

          if (withPrefixMatch && withPrefixMatch.length > 0) {
            existingIntegrations = withPrefixMatch;
            console.log('[PD] Found token match with prefix:', withPrefixMatch.length);
          } else {
            findError = exactError || noPrefixError || withPrefixError;
          }
        }
      }

      if (findError) {
        console.error('[PD] Error finding integration:', findError);
      }

      if (!existingIntegrations || existingIntegrations.length === 0) {
        console.warn('[PD] No matching integration row found for token. Cannot flip to connected.', {
          connect_token,
          tokenWithoutPrefix,
          tokenWithPrefix,
          hint: 'Verify pipedream-setup stored config.token and env matches',
        });
        // Return 200 OK even if no match found (so Pipedream doesn't retry)
        return new Response(
          JSON.stringify({
            success: false,
            message: 'No matching integration row found for token',
            matched: 0,
            searched_tokens: [connect_token, tokenWithoutPrefix, tokenWithPrefix]
          }),
          { 
            status: 200, // Return 200 OK to prevent Pipedream retries
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('[PD] Found integration rows to update:', existingIntegrations.map(r => ({ id: r.id, status: r.status, type: r.type })));

      let updatedCount = 0;
      const nowIso = new Date().toISOString();
      for (const row of existingIntegrations) {
        const mergedConfig = {
          ...(row.config || {}),
          account_id: account.id,
          account_name: account.name || account.external_id,
          connect_token,
          connect_session_id,
          environment,
          connected_at: nowIso,
          account_healthy: account.healthy,
        };

        const { error: updErr } = await supabase
          .from('user_integrations')
          .update({ status: 'connected', config: mergedConfig, updated_at: nowIso })
          .eq('id', row.id);

        if (updErr) {
          console.error('[PD] Update failed for integration id:', row.id, updErr);
        } else {
          updatedCount += 1;
        }
      }

      console.log('[PD] Integration connect updates complete:', { updatedCount });

    } else if (isErrorEvent) {
      console.log('[PD] Processing ERROR event:', { event, eventNorm, environment, connect_session_id });
      
      // Update integration status to error using same improved token matching
      const tokenWithoutPrefix = connect_token.replace('ctok_', '');
      const tokenWithPrefix = connect_token.startsWith('ctok_') ? connect_token : `ctok_${connect_token}`;
      
      console.log('[PD] Looking up integration for error by token:', { 
        connect_token, 
        tokenWithoutPrefix, 
        tokenWithPrefix 
      });

      // Try multiple search strategies for error case too
      let existingIntegrations: any[] = [];
      let findErr: any = null;

      // Strategy 1: Exact match
      let { data: exactMatch, error: exactError } = await supabase
        .from('user_integrations')
        .select('id, config')
        .eq('config->>token', connect_token);

      if (exactMatch && exactMatch.length > 0) {
        existingIntegrations = exactMatch;
        console.log('[PD] Found exact token match for error:', exactMatch.length);
      } else {
        // Strategy 2: Without prefix
        let { data: noPrefixMatch, error: noPrefixError } = await supabase
          .from('user_integrations')
          .select('id, config')
          .eq('config->>token', tokenWithoutPrefix);

        if (noPrefixMatch && noPrefixMatch.length > 0) {
          existingIntegrations = noPrefixMatch;
          console.log('[PD] Found token match without prefix for error:', noPrefixMatch.length);
        } else {
          // Strategy 3: With prefix
          let { data: withPrefixMatch, error: withPrefixError } = await supabase
            .from('user_integrations')
            .select('id, config')
            .eq('config->>token', tokenWithPrefix);

          if (withPrefixMatch && withPrefixMatch.length > 0) {
            existingIntegrations = withPrefixMatch;
            console.log('[PD] Found token match with prefix for error:', withPrefixMatch.length);
          } else {
            findErr = exactError || noPrefixError || withPrefixError;
          }
        }
      }

      if (findErr) {
        console.error('[PD] Error finding integration for error update:', findErr);
      }

      if (!existingIntegrations || existingIntegrations.length === 0) {
        console.warn('[PD] No matching integration row found to mark error.');
        // Return 200 OK even if no match found (so Pipedream doesn't retry)
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'No row matched for error', 
            matched: 0,
            searched_tokens: [connect_token, tokenWithoutPrefix, tokenWithPrefix]
          }),
          { 
            status: 200, // Return 200 OK to prevent Pipedream retries
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      let updatedCount = 0;
      const nowIso = new Date().toISOString();
      for (const row of existingIntegrations) {
        const mergedConfig = {
          ...(row.config || {}),
          connect_token,
          connect_session_id,
          environment,
          error_message: error || 'Unknown connection error',
          error_at: nowIso,
        };

        const { error: updErr } = await supabase
          .from('user_integrations')
          .update({ status: 'error', config: mergedConfig, updated_at: nowIso })
          .eq('id', row.id);
        if (updErr) {
          console.error('[PD] Error update failed for id:', row.id, updErr);
        } else {
          updatedCount += 1;
        }
      }

      console.log('[PD] Integration error updates complete:', { updatedCount, error_message: error });

    } else {
      console.log('[PD] Unknown event type received:', event);
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