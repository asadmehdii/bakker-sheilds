import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const userId = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    console.log('📥 Callback received:', { code: !!code, userId, error })

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
    const ghlClientId = Deno.env.get('GHL_CLIENT_ID')
    const ghlClientSecret = Deno.env.get('GHL_CLIENT_SECRET')
    const ghlRedirectUri = Deno.env.get('GHL_REDIRECT_URI')
    if (error) {
      return Response.redirect(`${appUrl}/integrations?error=${error}`, 302)
    }

    if (!code || !userId) {
      return Response.redirect(`${appUrl}/integrations?error=missing_parameters`, 302)
    }

    console.log('🔄 Exchanging code for token...')

    const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ghlClientId,
        client_secret: ghlClientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: ghlRedirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('❌ Token exchange failed:', errorText)
      return Response.redirect(`${appUrl}/integrations?error=token_failed`, 302)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in, locationId, companyId, userType } = tokenData

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString()

    const { data: integration, error: insertError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: userId,
        type: 'ghl',
        name: `GHL: ${locationId}`,
        status: 'connected',
        config: {
          access_token,
          refresh_token,
          location_id: locationId,
          company_id: companyId,
          user_type: userType,
          expires_at: expiresAt,
          connected_at: new Date().toISOString(),
        },
      })
      .select()
      .single()

    if (insertError) {
      console.error('❌ Database error:', insertError)
      return Response.redirect(`${appUrl}/integrations?error=database_error`, 302)
    }

    console.log('✅ Integration created:', integration.id)
    return Response.redirect(`${appUrl}/integrations?success=true`, 302)

  } catch (error) {
    console.error('❌ Error:', error)
    return Response.redirect(`http://localhost:5174/integrations?error=unexpected_error`, 302)
  }
})