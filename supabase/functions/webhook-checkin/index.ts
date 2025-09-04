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
    const extractContactInfo = (payload: any) => {
      // Try to extract client_name
      let clientName = ''
      if (payload.contact?.name) {
        clientName = payload.contact.name
      } else if (payload.contact?.firstName || payload.contact?.lastName) {
        clientName = `${payload.contact.firstName || ''} ${payload.contact.lastName || ''}`.trim()
      } else if (payload.name) {
        clientName = payload.name
      } else if (payload.client_name) {
        clientName = payload.client_name
      } else if (payload.firstName || payload.lastName) {
        clientName = `${payload.firstName || ''} ${payload.lastName || ''}`.trim()
      }

      // Try to extract client_id - validate it's a proper UUID format
      let clientId = payload.contact?.id || payload.contact_id || payload.client_id || null
      
      // Validate UUID format (8-4-4-4-12 characters)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (clientId && !uuidRegex.test(clientId)) {
        console.log(`⚠️ [Webhook] Invalid UUID format for client_id: ${clientId}, setting to null`)
        clientId = null
      }

      // Try to extract email
      const email = payload.contact?.email || payload.email || null

      // Try to extract phone
      const phone = payload.contact?.phone || payload.phone || null

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

    // Insert check-in into database
    const { data: checkin, error: insertError } = await supabase
      .from('checkins')
      .insert({
        coach_id: userId,
        client_id: clientId,
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