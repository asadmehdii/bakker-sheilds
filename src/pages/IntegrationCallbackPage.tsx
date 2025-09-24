import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import Navigation from '../components/Navigation';
import { supabase } from '../lib/supabase';

function IntegrationCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing integration...');

  useEffect(() => {
    // Handle Pipedream Connect OAuth callback
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      const state = searchParams.get('state');

      if (error) {
        setStatus('error');
        setMessage(`Integration failed: ${errorDescription || error}`);
        return;
      }

      if (code && state) {
        try {
          // Parse state to get integration details
          const stateData = JSON.parse(state);
          const { integration_type, user_id, webhook_url, integration_name } = stateData;

          setMessage(`Connecting your ${integration_type} account...`);

          // Exchange code for access token and create workflow via Supabase Edge Function
          const { data: callbackData, error: callbackError } = await supabase.functions.invoke('pipedream-callback', {
            body: {
              code,
              state: stateData,
              redirect_uri: `${window.location.origin}/integrations/callback`
            }
          });

          if (callbackError) {
            throw new Error(callbackError.message || 'Failed to complete integration setup');
          }

          if (callbackData && callbackData.success) {
            setStatus('success');
            setMessage(`Successfully connected ${integration_name}!`);
            
            // Post message to parent window if opened in popup
            if (window.opener) {
              window.opener.postMessage({
                type: 'pipedream-connect-success',
                account_id: callbackData.account_id,
                integration_type: integration_type,
                integration_name: integration_name
              }, window.location.origin);
              window.close();
            } else {
              // Redirect to integrations page after a delay
              setTimeout(() => {
                navigate('/integrations');
              }, 3000);
            }
          } else {
            throw new Error('Integration callback failed');
          }
        } catch (error) {
          console.error('Error processing callback:', error);
          setStatus('error');
          setMessage('Failed to complete integration setup. Please try again.');
        }
      } else {
        setStatus('error');
        setMessage('Integration callback received but missing required parameters');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          {status === 'processing' && (
            <div>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Processing Integration</h2>
              <p className="text-gray-600">{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Integration Connected!</h2>
              <p className="text-gray-600 mb-6">{message}</p>
              <p className="text-sm text-gray-500">Redirecting to integrations page...</p>
            </div>
          )}

          {status === 'error' && (
            <div>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Integration Failed</h2>
              <p className="text-gray-600 mb-6">{message}</p>
              <button
                onClick={() => navigate('/integrations')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Integrations
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IntegrationCallbackPage;