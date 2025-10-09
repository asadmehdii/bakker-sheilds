/*
  # Checkin Webhook Handler

  This edge function handles incoming check-in webhooks from external systems (primarily GoHighLevel).
  It processes flexible check-in data, generates embeddings, and stores them in the database.

  ## Features
  - Flexible data acceptance: Accepts any JSON payload structure
  - Contact data extraction: Intelligently extracts contact info from common GHL structures
  - Transcript derivation: Creates AI-ready transcript from various field combinations
  - Raw data storage: Preserves complete original payload for future processing
  - Embedding generation: Creates vector embeddings for AI analysis

  ## Environment Variables Required
  - OPENAI_API_KEY: OpenAI API key for generating embeddings
  - SUPABASE_SERVICE_ROLE_KEY: Service role key for admin operations

  ## API Usage
  - POST /webhook-checkin/{user_id}/{webhook_token} with flexible JSON payload
  - Validates webhook token and processes check-in data
*/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const openaiApiKey = Deno.env.get('openai_api_key')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract user_id and webhook_token from URL path
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(part => part.length > 0)
    
    // Expected path: /webhook-checkin/{user_id}/{webhook_token}
    if (pathParts.length < 3 || pathParts[0] !== 'webhook-checkin') {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook URL format. Expected: /webhook-checkin/{user_id}/{webhook_token}' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const userId = pathParts[1]
    const webhookToken = pathParts[2]

    if (!userId || !webhookToken) {
      return new Response(
        JSON.stringify({ error: 'Missing user ID or webhook token in URL' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Parse webhook payload - accept any JSON structure
    const payload = await req.json()
    console.log('📥 [Webhook] Received payload for user:', userId, 'Keys:', Object.keys(payload))

    // Verify webhook token against user's stored token
    const { data: webhookSettings, error: settingsError } = await supabase
      .from('user_checkin_webhook_settings')
      .select('webhook_secret')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (settingsError || !webhookSettings?.webhook_secret) {
      console.error('❌ [Webhook] Settings error:', settingsError)
      return new Response(
        JSON.stringify({ error: 'Webhook not configured for this user' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify webhook token
    if (webhookToken !== webhookSettings.webhook_secret) {
      console.error('❌ [Webhook] Token mismatch')
      return new Response(
        JSON.stringify({ error: 'Invalid webhook token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('✅ [Webhook] Token verified for user:', userId)

    // Extract contact information with intelligent fallbacks
   // Extract contact information with intelligent fallbacks
const extractContactInfo = (payload: any) => {
  console.log('🔍 [Webhook] Raw payload for extraction:', JSON.stringify(payload, null, 2))
  
  // Try to extract client_name - CHECK ALL POSSIBLE FIELDS
  let clientName = ''
  
  // Priority 1: Direct client_name field
  if (payload.client_name && typeof payload.client_name === 'string' && payload.client_name.trim()) {
    clientName = payload.client_name.trim()
    console.log('✅ [Webhook] Found client_name:', clientName)
  }
  // Priority 2: contact.name
  else if (payload.contact?.name && typeof payload.contact.name === 'string' && payload.contact.name.trim()) {
    clientName = payload.contact.name.trim()
    console.log('✅ [Webhook] Found contact.name:', clientName)
  }
  // Priority 3: firstName + lastName combination
  else if (payload.firstName || payload.lastName) {
    clientName = `${payload.firstName || ''} ${payload.lastName || ''}`.trim()
    console.log('✅ [Webhook] Built from firstName/lastName:', clientName)
  }
  // Priority 4: contact.firstName + contact.lastName
  else if (payload.contact?.firstName || payload.contact?.lastName) {
    clientName = `${payload.contact.firstName || ''} ${payload.contact.lastName || ''}`.trim()
    console.log('✅ [Webhook] Built from contact.firstName/lastName:', clientName)
  }
  // Priority 5: Just "name"
  else if (payload.name && typeof payload.name === 'string' && payload.name.trim()) {
    clientName = payload.name.trim()
    console.log('✅ [Webhook] Found name:', clientName)
  }

  // Try to extract client_id - validate it's a proper UUID format
  let clientId = payload.contact?.id || payload.contact_id || payload.client_id || null
  
  // Validate UUID format (8-4-4-4-12 characters)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (clientId && !uuidRegex.test(clientId)) {
    console.log(`⚠️ [Webhook] Invalid UUID format for client_id: ${clientId}, setting to null`)
    clientId = null
  }

  // Try to extract email - CHECK ALL POSSIBLE LOCATIONS
  let email = null
  if (payload.email && typeof payload.email === 'string' && payload.email.trim()) {
    email = payload.email.trim()
  } else if (payload.contact?.email && typeof payload.contact.email === 'string' && payload.contact.email.trim()) {
    email = payload.contact.email.trim()
  }

  // Try to extract phone - CHECK ALL POSSIBLE LOCATIONS
  let phone = null
  if (payload.phone && typeof payload.phone === 'string' && payload.phone.trim()) {
    phone = payload.phone.trim()
  } else if (payload.contact?.phone && typeof payload.contact.phone === 'string' && payload.contact.phone.trim()) {
    phone = payload.contact.phone.trim()
  }

  console.log('📋 [Webhook] Extracted:', { clientName, clientId, email, phone })
  return { clientName, clientId, email, phone }
}
    const { clientName, clientId, email, phone } = extractContactInfo(payload)

    // Validate that we have at least a client name
    if (!clientName) {
      return new Response(
        JSON.stringify({ 
          error: 'Client name is required. Please ensure your form includes name, firstName/lastName, or contact.name fields.' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('👤 [Webhook] Extracted contact info:', { clientName, clientId, email, phone })

    // Derive transcript from payload
    const deriveTranscript = (payload: any) => {
      // First, try to find content in expected transcript fields
      const transcriptFields = ['transcript', 'message', 'notes', 'checkin_notes']
      
      for (const field of transcriptFields) {
        if (payload[field] && typeof payload[field] === 'string' && payload[field].trim()) {
          console.log(`📝 [Webhook] Using ${field} as transcript`)
          return payload[field].trim()
        }
      }

      // If no dedicated transcript field found, create one from remaining data
      console.log('📝 [Webhook] No dedicated transcript field found, deriving from payload')
      
      // Fields to exclude from transcript derivation (already mapped or internal)
      const excludeFields = new Set([
        'contact', 'name', 'firstName', 'lastName', 'client_name', 'client_id', 'contact_id',
        'email', 'phone', 'id', 'timestamp', 'created_at', 'updated_at'
      ])

      // Create transcript from remaining fields
      const transcriptParts: string[] = []
      
      Object.entries(payload).forEach(([key, value]) => {
        if (!excludeFields.has(key) && value !== null && value !== undefined && value !== '') {
          if (typeof value === 'object') {
            transcriptParts.push(`${key}: ${JSON.stringify(value, null, 2)}`)
          } else {
            transcriptParts.push(`${key}: ${value}`)
          }
        }
      })

      if (transcriptParts.length === 0) {
        // Fallback: stringify the entire payload if no meaningful fields found
        return JSON.stringify(payload, null, 2)
      }

      return transcriptParts.join('\n')
    }

    const derivedTranscript = deriveTranscript(payload)
    console.log('📄 [Webhook] Derived transcript length:', derivedTranscript.length)

    // Generate embedding for the transcript
    let embedding = null
    try {
      console.log('🧠 [Webhook] Generating embedding...')
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-ada-002',
          input: derivedTranscript,
        }),
      })

      if (embeddingResponse.ok) {
        const embeddingData = await embeddingResponse.json()
        embedding = embeddingData.data[0].embedding
        console.log('✅ [Webhook] Embedding generated successfully')
      } else {
        const errorText = await embeddingResponse.text()
        console.error('❌ [Webhook] Failed to generate embedding:', errorText)
      }
    } catch (error) {
      console.error('❌ [Webhook] Error generating embedding:', error)
    }

    // Generate suggested tags from transcript (basic implementation)
    const generateTags = (transcript: string): string[] => {
      const tags: string[] = []
      const lowerTranscript = transcript.toLowerCase()
      
      // Basic keyword-based tagging
      const tagKeywords = {
        'nutrition': ['food', 'eat', 'diet', 'nutrition', 'meal', 'calories'],
        'exercise': ['workout', 'exercise', 'gym', 'training', 'fitness', 'run', 'lift'],
        'motivation': ['motivated', 'motivation', 'goal', 'progress', 'achievement'],
        'challenge': ['difficult', 'hard', 'struggle', 'challenge', 'problem'],
        'success': ['success', 'accomplished', 'achieved', 'completed', 'won'],
        'energy': ['energy', 'tired', 'exhausted', 'energetic', 'fatigue'],
        'mood': ['happy', 'sad', 'frustrated', 'excited', 'mood', 'feeling']
      }

      Object.entries(tagKeywords).forEach(([tag, keywords]) => {
        if (keywords.some(keyword => lowerTranscript.includes(keyword))) {
          tags.push(tag)
        }
      })

      return tags.length > 0 ? tags : ['general']
    }

    const suggestedTags = generateTags(derivedTranscript)
    console.log('🏷️ [Webhook] Generated tags:', suggestedTags)

    // Utility function to normalize phone numbers for matching
    const normalizePhone = (phone: string | null): string | null => {
      if (!phone) return null;
      // Remove all non-digit characters except + (for country codes)
      return phone.replace(/[^\d+]/g, '').replace(/^\+?1?/, '') // Remove US country code
    }


const findOrCreateClient = async () => {
  // First, get the coach's webhook settings for client matching preferences
  const { data: webhookSettings, error: settingsError } = await supabase
    .from('user_checkin_webhook_settings')
    .select('primary_identifier, fallback_identifier, auto_create_clients, new_client_status, new_client_engagement')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  let primary_identifier = 'email'
  let fallback_identifier = 'phone'
  let auto_create_clients = true
  let new_client_status = 'active'
  let new_client_engagement = 'medium'

  if (!settingsError && webhookSettings) {
    primary_identifier = webhookSettings.primary_identifier || 'email'
    fallback_identifier = webhookSettings.fallback_identifier || 'phone'
    auto_create_clients = webhookSettings.auto_create_clients !== false
    new_client_status = webhookSettings.new_client_status || 'active'
    new_client_engagement = webhookSettings.new_client_engagement || 'medium'
  } else {
    console.log('⚠️ [Webhook] Using default webhook settings')
  }

  console.log('🔍 [Webhook] Using matching strategy:', { primary_identifier, fallback_identifier, auto_create_clients })

  // Normalize identifiers
  const normalizedPhone = normalizePhone(phone)
  let normalizedEmail = email?.toLowerCase().trim()

  // Generate email if missing (for client creation)
  if (!normalizedEmail) {
    normalizedEmail = `webhook-${userId.substring(0, 8)}-${Date.now()}@generated.local`
    console.log('⚠️ [Webhook] No email provided, generated:', normalizedEmail)
  }

  // Helper function to find client by phone
  const findByPhone = async (phoneNumber: string) => {
    if (!phoneNumber) return null
    const { data: client } = await supabase
      .from('clients')
      .select('id, full_name, phone')
      .eq('coach_id', userId)
      .eq('phone', phoneNumber)
      .maybeSingle() // Use maybeSingle instead of single to avoid errors
    return client
  }

  // Helper function to find client by email
  const findByEmail = async (emailAddress: string) => {
    if (!emailAddress || emailAddress.includes('@generated.local')) return null
    const { data: client } = await supabase
      .from('clients')
      .select('id, full_name, email')
      .eq('coach_id', userId)
      .eq('email', emailAddress)
      .maybeSingle() // Use maybeSingle instead of single to avoid errors
    return client
  }

  // Try primary identifier first
  let matchedClient = null
  if (primary_identifier === 'phone' && normalizedPhone) {
    matchedClient = await findByPhone(normalizedPhone)
    if (matchedClient) {
      console.log('✅ [Webhook] Found client by phone (primary):', matchedClient.full_name)
      return matchedClient.id
    }
  } else if (primary_identifier === 'email' && email) {
    matchedClient = await findByEmail(normalizedEmail)
    if (matchedClient) {
      console.log('✅ [Webhook] Found client by email (primary):', matchedClient.full_name)
      return matchedClient.id
    }
  }

  // Try fallback identifier if primary didn't match
  if (fallback_identifier && fallback_identifier !== 'none' && fallback_identifier !== primary_identifier) {
    if (fallback_identifier === 'phone' && normalizedPhone) {
      matchedClient = await findByPhone(normalizedPhone)
      if (matchedClient) {
        console.log('✅ [Webhook] Found client by phone (fallback):', matchedClient.full_name)
        return matchedClient.id
      }
    } else if (fallback_identifier === 'email' && email) {
      matchedClient = await findByEmail(normalizedEmail)
      if (matchedClient) {
        console.log('✅ [Webhook] Found client by email (fallback):', matchedClient.full_name)
        return matchedClient.id
      }
    }
  }

  // No existing client found - check if we should auto-create
  if (!auto_create_clients) {
    throw new Error(`No existing client found and auto-creation is disabled. Name: ${clientName}, Phone: ${normalizedPhone}, Email: ${email || 'none'}`)
  }

  // Create new client (email is now guaranteed to exist, even if generated)
  console.log('🆕 [Webhook] Creating new client:', clientName)
  
  const clientData = {
    coach_id: userId,
    full_name: clientName,
    email: normalizedEmail, // Always include (generated if needed)
    phone: normalizedPhone || null,
    status: new_client_status,
    engagement_level: new_client_engagement,
    custom_fields: clientId ? { external_id: clientId } : {},
    tags: ['webhook-created'],
    onboarded_at: new Date().toISOString()
  }

  console.log('📝 [Webhook] Creating client with data:', clientData)

  const { data: newClient, error: clientError } = await supabase
    .from('clients')
    .insert(clientData)
    .select('id')
    .single()

  if (clientError) {
    console.error('❌ [Webhook] Error creating client:', clientError)
    console.error('❌ [Webhook] Attempted data:', clientData)
    throw new Error(`Failed to create client: ${clientError.message}`)
  }

  if (!newClient || !newClient.id) {
    throw new Error('Client creation succeeded but no ID returned')
  }

  console.log('✅ [Webhook] Created new client with ID:', newClient.id)
  return newClient.id
}

    // Get the definitive client ID using smart matching
    let definitiveClientId: string
    try {
      definitiveClientId = await findOrCreateClient()
    } catch (error) {
      console.error('❌ [Webhook] Failed to find/create client:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to process client information', details: error.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Insert check-in into database with definitive client ID
    const { data: checkin, error: insertError } = await supabase
      .from('checkins')
      .insert({
        coach_id: userId,
        client_id: definitiveClientId, // Now guaranteed to be a valid client ID
        client_name: clientName,
        transcript: derivedTranscript,
        embedding: embedding,
        tags: suggestedTags,
        raw_data: payload, // Store complete original payload
        date: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('❌ [Webhook] Error inserting check-in:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to store check-in', details: insertError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`✅ [Webhook] Successfully processed check-in for coach: ${userId}, client: ${clientName}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Check-in processed successfully',
        checkin_id: checkin.id,
        client_name: clientName,
        transcript_length: derivedTranscript.length,
        embedding_generated: !!embedding,
        suggested_tags: suggestedTags,
        raw_data_stored: true
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('❌ [Webhook] Internal error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})