/*
  # OpenAI CheckinAI Assistant Chat Function

  This edge function handles communication with OpenAI's CheckinAI Assistant API, which supports:
  1. Client check-in transcript analysis
  2. Smart recall from similar past sessions
  3. Thread-based conversation management
  4. File upload processing for transcript analysis
  5. Pattern recognition across coaching sessions

  ## Environment Variables Required
  - OPENAI_API_KEY: Your OpenAI API key
  - OPENAI_CHECKIN_ASSISTANT_ID: The ID of your configured OpenAI CheckinAI Assistant

  ## API Usage
  - POST /openai-checkin-chat with { message: string, threadId?: string, fileContent?: string, fileName?: string }
  - Returns { message: string, threadId: string }
*/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ChatRequest {
  message: string;
  threadId?: string;
  checkinId?: string;
}

interface ChatResponse {
  message: string;
  threadId: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message, threadId, checkinId }: ChatRequest = await req.json()

    if (!message?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get Supabase configuration
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const openaiApiKey = Deno.env.get('openai_api_key')
    const assistantId = Deno.env.get('OPENAI_CHECKIN_ASSISTANT_ID')

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!assistantId) {
      return new Response(
        JSON.stringify({ error: 'OpenAI CheckinAI Assistant ID not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const headers = {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    }

    let currentThreadId = threadId

    // Create a new thread if one doesn't exist
    if (!currentThreadId) {
      const threadResponse = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      })

      if (!threadResponse.ok) {
        const error = await threadResponse.text()
        console.error('Failed to create thread:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to create conversation thread' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      const thread = await threadResponse.json()
      currentThreadId = thread.id
    }

    // Prepare the message content with context
    let contextualMessage = message?.trim() || ''
    
    // If a checkinId is provided, fetch the checkin details and add context
    if (checkinId) {
      try {
        const { data: checkin, error: checkinError } = await supabase
          .from('checkins')
          .select('*')
          .eq('id', checkinId)
          .single();

        if (!checkinError && checkin) {
          // Add the checkin context to the message
          contextualMessage = `**CURRENT CHECK-IN CONTEXT:**
Client: ${checkin.client_name}
Date: ${new Date(checkin.date).toLocaleDateString()}
Status: ${checkin.status}
Tags: ${checkin.tags.join(', ')}

**TRANSCRIPT:**
${checkin.transcript}

**USER QUERY:**
${contextualMessage}

Please analyze this check-in and provide coaching insights, suggestions for response, and identify any patterns or concerns. Use your knowledge of effective coaching strategies to help the coach provide the best possible guidance to their client. If the coach seems to be just asking a question about a particular portion of a checkin, answer in a conversational and concise way without a long structured response.`;
        }
      } catch (error) {
        console.error('Error fetching checkin context:', error);
        // Continue without context if there's an error
      }
    }

    // Get user's niche analysis for context
    let nicheContext = ''
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (!userError && user) {
        const { data: userProfile, error: profileError } = await supabase
          .from('user_profiles')
          .select('niche_analysis')
          .eq('id', user.id)
          .single()

        if (!profileError && userProfile?.niche_analysis) {
          nicheContext = `\n\n**USER'S NICHE CONTEXT:**\n${userProfile.niche_analysis}\n\n**Please use this niche context to provide coaching insights and recommendations that are specifically tailored to this user's business and client base.**\n\n`
          console.log(`✅ [Checkin AI] Added niche context for user ${user.id}`)
        }
      }
    } catch (error) {
      console.warn('⚠️ [Checkin AI] Could not fetch niche context:', error)
    }

    // Add niche context to the message if available
    if (nicheContext) {
      contextualMessage = nicheContext + contextualMessage
    }

    // TODO: Implement smart recall functionality for similar check-ins
    // This would involve:
    // 1. Generate embedding for the current message/checkin
    // 2. Search for similar check-ins using vector similarity
    // 3. Add relevant past sessions to the context

    // Add the user's message to the thread
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        role: 'user',
        content: contextualMessage
      })
    })

    if (!messageResponse.ok) {
      const error = await messageResponse.text()
      console.error('Failed to add message:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to add message to conversation' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create a run to process the thread with the assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        assistant_id: assistantId
      })
    })

    if (!runResponse.ok) {
      const error = await runResponse.text()
      console.error('Failed to create run:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to process message with assistant' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const run = await runResponse.json()
    const runId = run.id

    // Poll for run completion
    let runStatus = 'queued'
    let attempts = 0
    const maxAttempts = 30 // 30 seconds timeout

    while (runStatus !== 'completed' && runStatus !== 'failed' && runStatus !== 'cancelled' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs/${runId}`, {
        headers
      })

      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        runStatus = statusData.status
        attempts++
      } else {
        break
      }
    }

    if (runStatus !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Assistant response timed out or failed' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Retrieve the assistant's response
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages?order=desc&limit=1`, {
      headers
    })

    if (!messagesResponse.ok) {
      const error = await messagesResponse.text()
      console.error('Failed to retrieve messages:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve assistant response' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const messagesData = await messagesResponse.json()
    const latestMessage = messagesData.data[0]

    if (!latestMessage || latestMessage.role !== 'assistant') {
      return new Response(
        JSON.stringify({ error: 'No assistant response found' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract the text content from the assistant's message
    const textContent = latestMessage.content.find((content: any) => content.type === 'text')
    const assistantMessage = textContent?.text?.value || 'I apologize, but I encountered an issue generating a response.'

    const response: ChatResponse = {
      message: assistantMessage,
      threadId: currentThreadId
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in openai-checkin-chat function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})