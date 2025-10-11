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

    if (integration.type !== 'typeform') {
      return new Response(
        JSON.stringify({ error: 'Invalid integration type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract Typeform token from config
    const config = integration.config || {}
    const typeformToken = config.access_token || config.token

    if (!typeformToken) {
      return new Response(
        JSON.stringify({ error: 'Typeform token not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch forms from Typeform API
    const typeformResponse = await fetch('https://api.typeform.com/forms', {
      headers: {
        'Authorization': `Bearer ${typeformToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!typeformResponse.ok) {
      console.error('Typeform API error:', typeformResponse.status, typeformResponse.statusText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch forms from Typeform' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const typeformData = await typeformResponse.json()
    
    // Transform Typeform data to our format
    const forms = typeformData.items?.map((form: any) => ({
      id: form.id,
      name: form.title || 'Untitled Form',
      url: form._links?.display || `https://form.typeform.com/to/${form.id}`,
      submission_count: 0, // Typeform doesn't provide submission count in this endpoint
      last_submission: null
    })) || []

    console.log(`✅ Fetched ${forms.length} Typeform forms for user ${user_id}`)

    return new Response(
      JSON.stringify({ forms }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error fetching Typeform forms:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})



