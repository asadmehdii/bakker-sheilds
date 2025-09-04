import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    // Extract user ID and webhook token from the path
    // Path format: /.netlify/functions/webhook-proxy/webhook-checkin/userId/webhookToken
    // or just: /webhook-checkin/userId/webhookToken
    const pathParts = event.path.split('/').filter(part => part.length > 0);
    
    console.log('Path parts:', pathParts);
    console.log('Full path:', event.path);
    
    // Find the index of 'webhook-checkin' in the path
    const webhookIndex = pathParts.findIndex(part => part === 'webhook-checkin');
    
    let userId: string | undefined;
    let webhookToken: string | undefined;
    
    if (webhookIndex !== -1 && pathParts.length > webhookIndex + 2) {
      userId = pathParts[webhookIndex + 1];
      webhookToken = pathParts[webhookIndex + 2];
    }

    // Fallback: try query parameters if path extraction fails
    if (!userId || !webhookToken) {
      userId = event.queryStringParameters?.userId;
      webhookToken = event.queryStringParameters?.webhookToken;
    }

    if (!userId || !webhookToken) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Missing user ID or webhook token in URL',
          debug: {
            path: event.path,
            pathParts,
            webhookIndex,
            extractedUserId: userId,
            extractedWebhookToken: webhookToken,
            queryParams: event.queryStringParameters
          }
        }),
      };
    }

    // Get Supabase configuration
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Supabase configuration missing' }),
      };
    }

    // Forward the request to the Supabase Edge Function
    const supabaseWebhookUrl = `${supabaseUrl}/functions/v1/webhook-checkin/${userId}/${webhookToken}`;
    
    console.log('Forwarding webhook to:', supabaseWebhookUrl);
    
    const response = await fetch(supabaseWebhookUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        // Forward any additional headers that might be important
        ...(event.headers['x-webhook-signature'] && {
          'x-webhook-signature': event.headers['x-webhook-signature']
        }),
      },
      body: event.body,
    });

    const responseData = await response.text();
    
    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: responseData,
    };

  } catch (error) {
    console.error('Webhook proxy error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};