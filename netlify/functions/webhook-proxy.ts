import { Handler } from '@netlify/functions';

// Retry configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second
const BACKOFF_MULTIPLIER = 2;

// Utility function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced error handling with retry logic
async function withRetry<T>(
  operation: () => Promise<T>, 
  attemptNumber: number = 1
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Attempt ${attemptNumber} failed:`, error);
    
    if (attemptNumber >= RETRY_ATTEMPTS) {
      throw error;
    }
    
    const delayMs = RETRY_DELAY * Math.pow(BACKOFF_MULTIPLIER, attemptNumber - 1);
    console.log(`Retrying in ${delayMs}ms (attempt ${attemptNumber + 1}/${RETRY_ATTEMPTS})`);
    
    await delay(delayMs);
    return withRetry(operation, attemptNumber + 1);
  }
}

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

    // Forward the request to the Supabase Edge Function with retry logic
    const supabaseWebhookUrl = `${supabaseUrl}/functions/v1/webhook-checkin/${userId}/${webhookToken}`;
    
    console.log('Forwarding webhook to:', supabaseWebhookUrl);
    
    const { response, responseData } = await withRetry(async () => {
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

      // Check if response indicates a retryable error
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // For non-retryable errors (4xx), don't retry but still capture the response
      const responseData = await response.text();
      
      // Only throw for actual server errors that should be retried
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status} - ${responseData}`);
      }
      
      return { response, responseData };
    });
    
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