import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
      .single()

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ error: 'Integration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (integration.type !== 'google_forms') {
      return new Response(
        JSON.stringify({ error: 'Invalid integration type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract Google Forms token from config
    const config = integration.config || {}
    const googleToken = config.access_token || config.token

    if (!googleToken) {
      return new Response(
        JSON.stringify({ error: 'Google Forms token not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch forms from Google Forms API
    const googleResponse = await fetch('https://forms.googleapis.com/v1/forms', {
      headers: {
        'Authorization': `Bearer ${googleToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!googleResponse.ok) {
      console.error('Google Forms API error:', googleResponse.status, googleResponse.statusText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch forms from Google Forms' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const googleData = await googleResponse.json()
    
    // Transform Google Forms data to our format
    const forms = googleData.forms?.map((form: any) => ({
      id: form.formId,
      name: form.info?.title || 'Untitled Form',
      url: form.responderUri || `https://docs.google.com/forms/d/${form.formId}/edit`,
      submission_count: 0, // Google Forms doesn't provide submission count in this endpoint
      last_submission: null
    })) || []

    console.log(`✅ Fetched ${forms.length} Google Forms for user ${user_id}`)

    return new Response(
      JSON.stringify({ forms }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error fetching Google Forms:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})



