/*
  GHL OAuth Callback Handler
  
  This function handles the OAuth callback from GoHighLevel after user authorizes the app.
  It exchanges the authorization code for access/refresh tokens and stores them securely.
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
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const userId = url.searchParams.get('state') // User ID passed as state parameter
    const error = url.searchParams.get('error')

    console.log('📥 [GHL OAuth] Callback received:', { code: !!code, userId, error })

    if (error) {
      console.error('❌ [GHL OAuth] Authorization error:', error)
      // Redirect back to app with error
      const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
      return Response.redirect(`${appUrl}/integrations?error=${encodeURIComponent(error)}`, 302)
    }

    if (!code || !userId) {
      console.error('❌ [GHL OAuth] Missing code or user ID')
      const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
      return Response.redirect(`${appUrl}/integrations?error=missing_parameters`, 302)
    }

    const ghlClientId = Deno.env.get('GHL_CLIENT_ID')
    const ghlClientSecret = Deno.env.get('GHL_CLIENT_SECRET')
    const ghlRedirectUri = Deno.env.get('GHL_REDIRECT_URI')

    if (!ghlClientId || !ghlClientSecret || !ghlRedirectUri) {
      console.error('❌ [GHL OAuth] Missing GHL credentials in environment')
      const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
      return Response.redirect(`${appUrl}/integrations?error=configuration_error`, 302)
    }

    console.log('🔄 [GHL OAuth] Exchanging code for access token...')

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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
      console.error('❌ [GHL OAuth] Token exchange failed:', errorText)
      const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
      return Response.redirect(`${appUrl}/integrations?error=token_exchange_failed`, 302)
    }

    const tokenData = await tokenResponse.json()
    console.log('✅ [GHL OAuth] Token received:', { 
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      locationId: tokenData.locationId,
      companyId: tokenData.companyId,
    })

    const { 
      access_token, 
      refresh_token, 
      expires_in, 
      locationId, 
      companyId,
      userType 
    } = tokenData

    // Get location details from GHL
    let locationName = 'GoHighLevel Account'
    try {
      const locationResponse = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Version': '2021-07-28',
        },
      })
      
      if (locationResponse.ok) {
        const locationData = await locationResponse.json()
        locationName = locationData.location?.name || locationData.name || locationName
        console.log('📍 [GHL OAuth] Location name:', locationName)
      }
    } catch (error) {
      console.log('⚠️ [GHL OAuth] Could not fetch location name:', error)
    }

    // Store tokens in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    console.log('💾 [GHL OAuth] Storing integration in database...')

    const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString()

    const { data: integration, error: insertError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: userId,
        type: 'ghl',
        name: `GHL: ${locationName}`,
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
      console.error('❌ [GHL OAuth] Database error:', insertError)
      const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
      return Response.redirect(`${appUrl}/integrations?error=database_error`, 302)
    }

    console.log('✅ [GHL OAuth] Integration created:', integration.id)

    // Subscribe to webhook events from GHL
    console.log('🔔 [GHL OAuth] Setting up webhook subscription...')
    
    try {
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ghl-webhook-handler`
      
      const webhookResponse = await fetch('https://services.leadconnectorhq.com/hooks/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify({
          locationId: locationId,
          events: ['FormSubmitted'],
          url: webhookUrl,
        }),
      })

      if (webhookResponse.ok) {
        const webhookData = await webhookResponse.json()
        console.log('✅ [GHL OAuth] Webhook created:', webhookData.id)

        // Store webhook subscription info
        await supabase.from('ghl_webhook_subscriptions').insert({
          user_id: userId,
          integration_id: integration.id,
          location_id: locationId,
          ghl_webhook_id: webhookData.id,
          event_type: 'FormSubmitted',
          webhook_url: webhookUrl,
          is_active: true,
        })

        console.log('✅ [GHL OAuth] Webhook subscription stored in database')
      } else {
        const webhookError = await webhookResponse.text()
        console.error('⚠️ [GHL OAuth] Webhook creation failed:', webhookError)
        // Continue anyway - user can retry webhook setup later
      }
    } catch (webhookError) {
      console.error('⚠️ [GHL OAuth] Webhook setup error:', webhookError)
      // Continue anyway - user can retry webhook setup later
    }

    // Redirect back to app with success
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
    console.log('✅ [GHL OAuth] Redirecting to:', `${appUrl}/integrations?success=true&integration_id=${integration.id}`)
    
    return Response.redirect(`${appUrl}/integrations?success=true&integration_id=${integration.id}`, 302)

  } catch (error) {
    console.error('❌ [GHL OAuth] Unexpected error:', error)
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
    return Response.redirect(`${appUrl}/integrations?error=unexpected_error`, 302)
  }
})

