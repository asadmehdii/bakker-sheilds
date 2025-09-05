/*
  # OpenAI CheckinAI Analysis Function

  This edge function generates AI analysis and recommendations for client check-ins:
  1. Analyzes the check-in transcript and context
  2. Looks for patterns based on client history
  3. Provides coaching recommendations
  4. Suggests plan modifications

  ## Environment Variables Required
  - OPENAI_API_KEY: Your OpenAI API key
  - OPENAI_CHECKIN_ASSISTANT_ID: The ID of your configured OpenAI CheckinAI Assistant

  ## API Usage
  - POST /openai-checkin-analysis with { checkinId: string, clientName: string, transcript: string, tags: string[] }
  - Returns { analysis: string }
*/

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AnalysisRequest {
  checkinId: string;
  clientId?: string;
  clientName: string;
  transcript: string;
  tags: string[];
  previousAnalysis?: string;
}

interface AnalysisResponse {
  analysis: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { checkinId, clientId, clientName, transcript, tags, previousAnalysis }: AnalysisRequest = await req.json()

    if (!checkinId || !clientName || !transcript) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: checkinId, clientName, transcript' }),
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

    const openaiApiKeyRaw = Deno.env.get('openai_api_key')
    const openaiApiKey = typeof openaiApiKeyRaw === 'string' ? openaiApiKeyRaw.trim() : null

    console.log('OpenAI API Key status:', openaiApiKey ? 'Present' : 'Missing')
    console.log('OpenAI API Key length:', openaiApiKey?.length || 0)

    if (!openaiApiKey || openaiApiKey === '') {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get the current checkin details
    const { data: currentCheckin, error: checkinError } = await supabase
      .from('checkins')
      .select('*')
      .eq('id', checkinId)
      .single();

    if (checkinError || !currentCheckin) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch checkin details' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get client's previous check-ins for context (last 5)
    const { data: previousCheckins, error: historyError } = await supabase
      .from('checkins')
      .select('date, transcript, tags, coach_response, response_type')
      .eq('coach_id', currentCheckin.coach_id)
      .eq('client_name', clientName)
      .neq('id', checkinId)
      .order('date', { ascending: false })
      .limit(5);

    if (historyError) {
      console.warn('Failed to fetch client history:', historyError);
    }

    // Get similar check-ins from other clients (based on tags) for pattern recognition
    const { data: similarCheckins, error: similarError } = await supabase
      .from('checkins')
      .select('client_name, transcript, tags, coach_response, response_type')
      .eq('coach_id', currentCheckin.coach_id)
      .neq('client_name', clientName)
      .overlaps('tags', tags)
      .not('coach_response', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3);

    if (similarError) {
      console.warn('Failed to fetch similar check-ins:', similarError);
    }

    // Prepare context for AI analysis
    let contextualPrompt = `**CURRENT CHECK-IN ANALYSIS REQUEST**

**Client:** ${clientName}
**Date:** ${new Date(currentCheckin.date).toLocaleDateString()}
**Tags:** ${tags.join(', ')}

**Current Check-in Transcript:**
${transcript}

`;

    // Add client history context
    if (previousCheckins && previousCheckins.length > 0) {
      contextualPrompt += `**CLIENT HISTORY (Last ${previousCheckins.length} check-ins):**
`;
      previousCheckins.forEach((checkin, index) => {
        contextualPrompt += `
${index + 1}. **${new Date(checkin.date).toLocaleDateString()}** (Tags: ${checkin.tags.join(', ')})
   Transcript: ${checkin.transcript?.substring(0, 200)}...
   ${checkin.coach_response ? `Coach Response: ${checkin.coach_response.substring(0, 150)}...` : 'No coach response recorded'}
`;
      });
    }

    // Add similar cases context
    if (similarCheckins && similarCheckins.length > 0) {
      contextualPrompt += `
**SIMILAR CASES FROM OTHER CLIENTS:**
`;
      similarCheckins.forEach((checkin, index) => {
        contextualPrompt += `
${index + 1}. **Client:** ${checkin.client_name} (Tags: ${checkin.tags.join(', ')})
   Issue: ${checkin.transcript?.substring(0, 150)}...
   Coach Solution: ${checkin.coach_response?.substring(0, 200)}...
`;
      });
    }

    contextualPrompt += `

**ANALYSIS REQUEST:**
Please provide a comprehensive analysis of this check-in including:

1. **Key Insights:** What are the main points from this check-in?
2. **Patterns:** How does this compare to their previous check-ins?
3. **Recommendations:** What specific actions should the coach consider?
4. **Plan Modifications:** What changes might be needed to their current plan?
5. **Similar Cases:** How have similar issues been handled successfully?

Please be specific and actionable in your recommendations. Focus on practical coaching strategies that have proven effective.`;

    // Call OpenAI API for analysis
    console.log('Attempting to call OpenAI API...')
    
    let openaiResponse;
    try {
      openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert fitness and wellness coach with years of experience analyzing client check-ins and providing actionable coaching recommendations. You excel at identifying patterns, suggesting plan modifications, and drawing insights from similar cases to help coaches provide the best possible guidance to their clients.'
            },
            {
              role: 'user',
              content: contextualPrompt
            }
          ],
          max_tokens: 1000,
          temperature: 0.7
        })
      });
    } catch (fetchError) {
      console.error('Fetch error when calling OpenAI API:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Network error when calling OpenAI API', details: fetchError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('OpenAI API response status:', openaiResponse.status)

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error response:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate AI analysis', details: errorText }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const openaiData = await openaiResponse.json();
    const analysis = openaiData.choices[0]?.message?.content || 'Unable to generate analysis at this time.';

    const response: AnalysisResponse = {
      analysis: analysis
    };

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in openai-checkin-analysis function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})