/*
  GHL Webhook Handler
  
  This function receives webhook events from GoHighLevel when forms are submitted.
  It only processes submissions from forms that the user has explicitly selected.
*/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

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
    const payload = await req.json()
    console.log('📥 [GHL Webhook] Received event:', {
      type: payload.type,
      locationId: payload.locationId,
      formId: payload.formId,
    })

    const { type, locationId, contact, formSubmission, formId } = payload

    // Only process FormSubmitted events
    if (type !== 'FormSubmitted') {
      console.log('⏭️ [GHL Webhook] Ignoring non-form event:', type)
      return new Response(
        JSON.stringify({ message: 'Event type not supported' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!formId) {
      console.error('❌ [GHL Webhook] No form ID in payload')
      return new Response(
        JSON.stringify({ error: 'Missing form ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check if this form is being monitored by any user
    console.log('🔍 [GHL Webhook] Checking if form is selected:', formId)
    
    const { data: formSelection, error: selectionError } = await supabase
      .from('ghl_form_selections')
      .select(`
        *,
        user_integrations!inner(
          user_id,
          status,
          config
        )
      `)
      .eq('form_id', formId)
      .eq('is_active', true)
      .eq('user_integrations.status', 'connected')
      .single()

    if (selectionError || !formSelection) {
      console.log('⏭️ [GHL Webhook] Form not selected by any user:', formId)
      return new Response(
        JSON.stringify({ message: 'Form not monitored' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = formSelection.user_integrations.user_id
    console.log('✅ [GHL Webhook] Form is monitored by user:', userId)

    // Extract contact information
    const contactName = contact?.name || 
                       `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() ||
                       'Unknown Contact'
    
    const contactEmail = contact?.email || null
    const contactPhone = contact?.phone || null

    console.log('👤 [GHL Webhook] Contact info:', { contactName, contactEmail, contactPhone })

    // Format form submission data into transcript
    const transcript = formatFormSubmission(formSubmission, payload)
    console.log('📝 [GHL Webhook] Transcript length:', transcript.length)

    // Generate embedding for the transcript
    let embedding = null
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (openaiApiKey && transcript) {
      try {
        console.log('🧠 [GHL Webhook] Generating embedding...')
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-ada-002',
            input: transcript,
          }),
        })

        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json()
          embedding = embeddingData.data[0].embedding
          console.log('✅ [GHL Webhook] Embedding generated')
        } else {
          console.error('⚠️ [GHL Webhook] Embedding generation failed')
        }
      } catch (error) {
        console.error('⚠️ [GHL Webhook] Embedding error:', error)
      }
    }

    // Generate tags from transcript
    const tags = generateTags(transcript)
    console.log('🏷️ [GHL Webhook] Generated tags:', tags)

    // Find or create client
    console.log('🔍 [GHL Webhook] Finding/creating client...')
    const clientId = await findOrCreateClient(
      supabase,
      userId,
      contactName,
      contactEmail,
      contactPhone,
      contact?.id
    )

    if (!clientId) {
      console.error('❌ [GHL Webhook] Failed to find/create client')
      return new Response(
        JSON.stringify({ error: 'Failed to process client' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ [GHL Webhook] Client ID:', clientId)

    // Create check-in
    console.log('💾 [GHL Webhook] Creating check-in...')
    const { data: checkin, error: checkinError } = await supabase
      .from('checkins')
      .insert({
        coach_id: userId,
        client_id: clientId,
        client_name: contactName,
        transcript: transcript,
        embedding: embedding,
        tags: tags,
        raw_data: {
          ...payload,
          source: 'ghl',
          form_id: formId,
          form_name: formSelection.form_name,
        },
        date: new Date().toISOString(),
      })
      .select()
      .single()

    if (checkinError) {
      console.error('❌ [GHL Webhook] Check-in creation error:', checkinError)
      return new Response(
        JSON.stringify({ error: 'Failed to create check-in', details: checkinError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ [GHL Webhook] Check-in created:', checkin.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Check-in created successfully',
        checkin_id: checkin.id,
        client_name: contactName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ [GHL Webhook] Unexpected error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Helper function to format form submission into readable transcript
function formatFormSubmission(formSubmission: any, fullPayload: any): string {
  const parts: string[] = []

  // Add form name if available
  if (fullPayload.formName) {
    parts.push(`Form: ${fullPayload.formName}`)
    parts.push('---')
  }

  // Process form data
  if (formSubmission?.data) {
    const formData = formSubmission.data
    
    for (const [key, value] of Object.entries(formData)) {
      if (value && typeof value === 'object') {
        parts.push(`${key}: ${JSON.stringify(value)}`)
      } else if (value) {
        parts.push(`${key}: ${value}`)
      }
    }
  }

  // If no form data, use full payload
  if (parts.length === 0) {
    return JSON.stringify(fullPayload, null, 2)
  }

  return parts.join('\n')
}

// Helper function to generate tags from transcript
function generateTags(transcript: string): string[] {
  const tags: string[] = ['ghl']
  const lowerTranscript = transcript.toLowerCase()
  
  const tagKeywords = {
    'nutrition': ['food', 'eat', 'diet', 'nutrition', 'meal', 'calories'],
    'exercise': ['workout', 'exercise', 'gym', 'training', 'fitness', 'run', 'lift'],
    'motivation': ['motivated', 'motivation', 'goal', 'progress', 'achievement'],
    'challenge': ['difficult', 'hard', 'struggle', 'challenge', 'problem'],
    'success': ['success', 'accomplished', 'achieved', 'completed', 'won'],
    'energy': ['energy', 'tired', 'exhausted', 'energetic', 'fatigue'],
    'mood': ['happy', 'sad', 'frustrated', 'excited', 'mood', 'feeling']
  }

  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some(keyword => lowerTranscript.includes(keyword))) {
      tags.push(tag)
    }
  }

  return tags.length > 1 ? tags : ['ghl', 'general']
}

// Helper function to normalize phone numbers
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null
  return phone.replace(/[^\d+]/g, '').replace(/^\+?1?/, '')
}

// Helper function to find or create client
async function findOrCreateClient(
  supabase: any,
  userId: string,
  name: string,
  email: string | null,
  phone: string | null,
  externalId: string | null
): Promise<string | null> {
  
  const normalizedPhone = normalizePhone(phone)
  const normalizedEmail = email?.toLowerCase().trim() || null

  // Get webhook settings for client matching preferences
  const { data: webhookSettings } = await supabase
    .from('user_checkin_webhook_settings')
    .select('primary_identifier, fallback_identifier, auto_create_clients, new_client_status, new_client_engagement')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  const primaryIdentifier = webhookSettings?.primary_identifier || 'phone'
  const fallbackIdentifier = webhookSettings?.fallback_identifier || 'email'
  const autoCreateClients = webhookSettings?.auto_create_clients !== false
  const newClientStatus = webhookSettings?.new_client_status || 'active'
  const newClientEngagement = webhookSettings?.new_client_engagement || 'medium'

  // Try primary identifier
  if (primaryIdentifier === 'phone' && normalizedPhone) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('coach_id', userId)
      .eq('phone', normalizedPhone)
      .single()
    
    if (client) return client.id
  } else if (primaryIdentifier === 'email' && normalizedEmail) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('coach_id', userId)
      .eq('email', normalizedEmail)
      .single()
    
    if (client) return client.id
  }

  // Try fallback identifier
  if (fallbackIdentifier && fallbackIdentifier !== 'none' && fallbackIdentifier !== primaryIdentifier) {
    if (fallbackIdentifier === 'phone' && normalizedPhone) {
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('coach_id', userId)
        .eq('phone', normalizedPhone)
        .single()
      
      if (client) return client.id
    } else if (fallbackIdentifier === 'email' && normalizedEmail) {
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('coach_id', userId)
        .eq('email', normalizedEmail)
        .single()
      
      if (client) return client.id
    }
  }

  // No match found - auto-create if enabled
  if (!autoCreateClients) {
    console.error('❌ Auto-create disabled and no matching client found')
    return null
  }

  if (!normalizedPhone && !normalizedEmail) {
    console.error('❌ Cannot create client without phone or email')
    return null
  }

  // Create new client
  const { data: newClient, error } = await supabase
    .from('clients')
    .insert({
      coach_id: userId,
      full_name: name,
      email: normalizedEmail,
      phone: normalizedPhone,
      status: newClientStatus,
      engagement_level: newClientEngagement,
      custom_fields: externalId ? { ghl_contact_id: externalId } : {},
      tags: ['ghl', 'auto-created'],
      onboarded_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('❌ Failed to create client:', error)
    return null
  }

  console.log('✅ Created new client:', newClient.id)
  return newClient.id
}

