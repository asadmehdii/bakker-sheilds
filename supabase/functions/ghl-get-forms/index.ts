/*
  GHL Get Forms Function
  
  This function fetches all available forms from a user's GHL account.
  Used by the frontend to display form selection UI.
*/

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { integration_id, user_id } = await req.json()

    if (!integration_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get integration details
    const { data: integration, error: integrationError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('id', integration_id)
      .eq('user_id', user_id)
      .eq('type', 'ghl')
      .single()

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ error: 'Integration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { access_token, location_id } = integration.config

    if (!access_token || !location_id) {
      return new Response(
        JSON.stringify({ error: 'Invalid integration configuration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('📋 [GHL Get Forms] Fetching forms for location:', location_id)

    // Fetch forms from GHL API
    const formsResponse = await fetch(
      `https://services.leadconnectorhq.com/forms/?locationId=${location_id}`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Version': '2021-07-28',
        },
      }
    )

    if (!formsResponse.ok) {
      const errorText = await formsResponse.text()
      console.error('❌ [GHL Get Forms] API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch forms from GHL' }),
        { status: formsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formsData = await formsResponse.json()
    console.log('✅ [GHL Get Forms] Retrieved forms:', formsData.forms?.length || 0)

    // Transform forms data for frontend
    const forms = (formsData.forms || []).map((form: any) => ({
      id: form.id,
      name: form.name,
      url: `https://app.leadconnectorhq.com/v2/location/${location_id}/form-builder-v2/${form.id}`,
      submission_count: 0, // GHL doesn't provide submission count in this endpoint
      last_submission: null
    }))

    return new Response(
      JSON.stringify({ forms }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ [GHL Get Forms] Unexpected error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

