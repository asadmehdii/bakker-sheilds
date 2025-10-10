import React, { useState, useEffect } from 'react';
import { X, Plus, Zap, Globe, FileText, Settings, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { userService, supabase } from '../lib/supabase';

interface IntegrationSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (integration: Integration) => void;
}

interface Integration {
  id: string;
  type: 'typeform' | 'google_forms' | 'custom_webhook' | 'ghl';
  name: string;
  status: 'connected' | 'disconnected' | 'pending';
  config: any;
  created_at?: string;
}

const INTEGRATION_TYPES = [
  {
    id: 'ghl',
    name: 'GoHighLevel',
    description: 'Connect your GHL forms and surveys automatically',
    icon: Zap,
    color: 'from-purple-600 to-indigo-700',
    popular: true
  },
  {
    id: 'typeform',
    name: 'Typeform',
    description: 'Connect your Typeform surveys and forms',
    icon: FileText,
    color: 'from-gray-600 to-gray-700',
    popular: true
  },
  {
    id: 'google_forms',
    name: 'Google Forms',
    description: 'Connect your Google Forms responses',
    icon: Globe,
    color: 'from-blue-600 to-blue-700',
    popular: true
  },
  {
    id: 'custom_webhook',
    name: 'Custom Webhook',
    description: 'Connect any platform with webhook support',
    icon: Zap,
    color: 'from-purple-600 to-purple-700',
    popular: false
  }
];

function IntegrationSetupModal({ isOpen, onClose, onSave }: IntegrationSetupModalProps) {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [integrationName, setIntegrationName] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isLoadingWebhook, setIsLoadingWebhook] = useState(false);

  // Get webhook URL for current user
  useEffect(() => {
    if (isOpen && user) {
      setIsLoadingWebhook(true);
      userService.getUserWebhookUrl()
        .then(url => {
          if (url) {
            setWebhookUrl(url);
          } else {
            console.error('Failed to generate webhook URL');
          }
        })
        .catch(error => {
          console.error('Error getting webhook URL:', error);
        })
        .finally(() => {
          setIsLoadingWebhook(false);
        });
    }
  }, [isOpen, user]);

  const handlePipedreamConnect = async (integrationType: string) => {
    setIsConnecting(true);
    
    try {
      if (!user || !webhookUrl) {
        throw new Error('User not authenticated or webhook URL not available');
      }

      // Step 1: Create integration in our backend
      const { data: setupData, error: setupError } = await supabase.functions.invoke('pipedream-setup-integration', {
        body: {
          user_id: user.id,
          integration_type: integrationType,
          webhook_url: webhookUrl,
          integration_name: integrationName || `${INTEGRATION_TYPES.find(t => t.id === integrationType)?.name} Integration`
        }
      });

      if (setupError) {
        console.error('Setup error:', setupError);
        throw new Error('Failed to setup integration');
      }

      const { connect_url, integration_id } = setupData;

      // Step 2: Open Pipedream Connect auth flow in popup
      const popup = window.open(
        connect_url,
        'pipedream-connect',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        alert('Please allow popups to complete the integration setup.');
        return;
      }

      // Poll for integration status updates since Pipedream uses webhooks
      let pollCount = 0;
      const maxPolls = 60; // Poll for 5 minutes max (60 * 5 seconds)
      
      const pollForCompletion = setInterval(async () => {
        pollCount++;
        
        // Check if popup was closed manually
        if (popup.closed) {
          clearInterval(pollForCompletion);
          setIsConnecting(false);
          return;
        }

        // Check if we've exceeded max polling time
        if (pollCount >= maxPolls) {
          clearInterval(pollForCompletion);
          popup.close();
          setIsConnecting(false);
          
          // TEMPORARY: Since Pipedream webhooks aren't working in development,
          // manually mark as connected after timeout for testing
          if (confirm('Integration setup timed out. Mark as connected for testing?')) {
            const { error } = await supabase
              .from('user_integrations')
              .update({ 
                status: 'connected',
                config: {
                  account_id: `test_account_${Date.now()}`,
                  webhook_url: webhookUrl,
                  connected_at: new Date().toISOString(),
                  manual_connection: true
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', integration_id);
              
            if (!error) {
              const integration: Integration = {
                id: integration_id,
                type: integrationType as any,
                name: integrationName || `${INTEGRATION_TYPES.find(t => t.id === integrationType)?.name} Integration`,
                status: 'connected',
                config: { manual_connection: true, webhook_url: webhookUrl },
                created_at: new Date().toISOString()
              };
              onSave(integration);
              onClose();
            }
          }
          return;
        }

        try {
          // Check integration status in database
          const { data: integrations, error } = await supabase
            .from('user_integrations')
            .select('*')
            .eq('id', integration_id)
            .single();

          if (error) {
            console.error('Error polling integration status:', error);
            return;
          }

          console.log('Polling integration status:', {
            integration_id,
            status: integrations?.status,
            config: integrations?.config,
            updated_at: integrations?.updated_at
          });

          if (integrations && integrations.status === 'connected') {
            // Integration completed successfully
            clearInterval(pollForCompletion);
            popup.close();
            
            const integration: Integration = {
              id: integration_id,
              type: integrationType as any,
              name: integrationName || `${INTEGRATION_TYPES.find(t => t.id === integrationType)?.name} Integration`,
              status: 'connected',
              config: integrations.config,
              created_at: integrations.created_at
            };
            
            onSave(integration);
            onClose();
          } else if (integrations && integrations.status === 'error') {
            // Integration failed
            clearInterval(pollForCompletion);
            popup.close();
            setIsConnecting(false);
            alert('Integration setup failed. Please try again.');
          }
        } catch (error) {
          console.error('Error during polling:', error);
        }
      }, 5000); // Poll every 5 seconds
      
    } catch (error) {
      console.error('Error initiating Pipedream Connect:', error);
      alert('Failed to start integration setup. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCustomWebhook = async () => {
    if (!user || !webhookUrl) {
      console.error('Missing user or webhook URL');
      return;
    }

    try {
      // Ensure webhook settings exist in database
      // The getUserWebhookUrl function should have already created them,
      // but let's make sure they're active and properly configured
      const { error } = await userService.ensureWebhookSettingsExist(integrationName || 'Custom Webhook Integration');
      
      if (error) {
        console.error('Error ensuring webhook settings:', error);
        alert('Failed to save webhook integration. Please try again.');
        return;
      }

      const integration: Integration = {
        id: `custom-${Date.now()}`,
        type: 'custom_webhook',
        name: integrationName || 'Custom Webhook Integration',
        status: 'connected',
        config: {
          webhook_url: webhookUrl,
          setup_instructions: 'Send POST requests to the webhook URL with your form data',
          created_at: new Date().toISOString()
        }
      };
      
      onSave(integration);
      onClose();
    } catch (error) {
      console.error('Error saving custom webhook:', error);
      alert('Failed to save webhook integration. Please try again.');
    }
  };

  const handleGHLConnect = async () => {
    if (!user) {
      console.error('User not authenticated');
      return;
    }

    setIsConnecting(true);

    try {
      const ghlClientId = import.meta.env.VITE_GHL_CLIENT_ID;
      const ghlRedirectUri = import.meta.env.VITE_GHL_REDIRECT_URI;

      if (!ghlClientId || !ghlRedirectUri) {
        alert('GHL integration not configured. Please contact support.');
        return;
      }

      // Build GHL OAuth URL
      const authUrl = new URL('https://marketplace.leadconnectorhq.com/oauth/chooselocation');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', ghlClientId);
      authUrl.searchParams.set('redirect_uri', ghlRedirectUri);
      authUrl.searchParams.set('scope', 'contacts.readonly forms.readonly');    
        authUrl.searchParams.set('state', user.id); // Pass user ID as state

      // Redirect to GHL OAuth
      window.location.href = authUrl.toString();
    } catch (error) {
      console.error('Error initiating GHL OAuth:', error);
      alert('Failed to connect to GoHighLevel. Please try again.');
      setIsConnecting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Add Integration</h2>
            <p className="text-sm text-gray-600 mt-1">Connect your forms and surveys to CheckinAI</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {!selectedType ? (
            /* Integration Type Selection */
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Choose Integration Type</h3>
              <div className="grid grid-cols-1 gap-4">
                {INTEGRATION_TYPES.map((integration) => {
                  const Icon = integration.icon;
                  return (
                    <button
                      key={integration.id}
                      onClick={() => setSelectedType(integration.id)}
                      className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group text-left"
                    >
                      <div className={`p-3 bg-gradient-to-r ${integration.color} rounded-lg mr-4`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900">{integration.name}</h4>
                          {integration.popular && (
                            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                              Popular
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{integration.description}</p>
                      </div>
                      <div className="text-gray-400 group-hover:text-blue-600">
                        <ExternalLink className="w-5 h-5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Integration Configuration */
            <div>
              <button
                onClick={() => setSelectedType(null)}
                className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                ← Back to integrations
              </button>

              {selectedType === 'ghl' ? (
                /* GoHighLevel Setup */
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Connect GoHighLevel</h3>
                  
                  <div className="space-y-4">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-start">
                        <Zap className="w-5 h-5 text-purple-600 mr-3 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-purple-900 mb-2">How It Works</h4>
                          <div className="text-sm text-purple-800 space-y-2">
                            <p><strong>1.</strong> Click "Connect GoHighLevel" to authorize access</p>
                            <p><strong>2.</strong> Select which GHL location to connect</p>
                            <p><strong>3.</strong> Choose specific forms to monitor</p>
                            <p><strong>4.</strong> Form submissions automatically create check-ins!</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-2">What Gets Connected</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Read your forms and surveys</li>
                        <li>• Access contact information (name, email, phone)</li>
                        <li>• Receive form submission notifications</li>
                      </ul>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        onClick={() => setSelectedType(null)}
                        className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                        disabled={isConnecting}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleGHLConnect}
                        disabled={isConnecting}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        {isConnecting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            Connect GoHighLevel
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedType === 'custom_webhook' ? (
                /* Custom Webhook Setup */
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Custom Webhook Setup</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Integration Name
                      </label>
                      <input
                        type="text"
                        value={integrationName}
                        onChange={(e) => setIntegrationName(e.target.value)}
                        placeholder="e.g., Contact Form Integration"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Your Webhook URL
                      </label>
                      {isLoadingWebhook ? (
                        <div className="flex items-center justify-center p-4 border border-gray-300 rounded-lg bg-gray-50">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                          <span className="text-gray-600">Generating webhook URL...</span>
                        </div>
                      ) : (
                        <div className="flex">
                          <input
                            type="text"
                            value={webhookUrl}
                            readOnly
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg bg-gray-50 text-gray-600 font-mono text-sm"
                            placeholder={!webhookUrl ? "Webhook URL will appear here" : undefined}
                          />
                          <button
                            onClick={() => navigator.clipboard.writeText(webhookUrl)}
                            disabled={!webhookUrl}
                            className="px-4 py-2 bg-blue-600 text-white rounded-r-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Copy
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-2">Setup Instructions</h4>
                      <div className="text-sm text-blue-800 space-y-2">
                        <p><strong>For GoHighLevel:</strong></p>
                        <p>1. Copy the webhook URL above</p>
                        <p>2. Go to Settings → Integrations → Webhooks in your GHL account</p>
                        <p>3. Create a new webhook with the URL above</p>
                        <p>4. Set triggers for form submissions or contact events</p>
                        <p>5. Test with a form submission</p>
                        <div className="mt-3 pt-3 border-t border-blue-200">
                          <p><strong>For other platforms:</strong> Use this URL as a POST webhook endpoint. Ensure form data includes name, email, and/or phone fields.</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        onClick={() => setSelectedType(null)}
                        className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCustomWebhook}
                        disabled={isLoadingWebhook || !webhookUrl}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check className="w-4 h-4" />
                        Setup Custom Webhook
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Pipedream Connect Setup */
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Connect {INTEGRATION_TYPES.find(t => t.id === selectedType)?.name}
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Integration Name
                      </label>
                      <input
                        type="text"
                        value={integrationName}
                        onChange={(e) => setIntegrationName(e.target.value)}
                        placeholder={`My ${INTEGRATION_TYPES.find(t => t.id === selectedType)?.name} Integration`}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start">
                        <Zap className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-blue-900 mb-2">One-Click Setup</h4>
                          <div className="text-sm text-blue-800 space-y-2">
                            <p><strong>1.</strong> Click "Connect {INTEGRATION_TYPES.find(t => t.id === selectedType)?.name}" below</p>
                            <p><strong>2.</strong> Authorize CheckinAI to access your {INTEGRATION_TYPES.find(t => t.id === selectedType)?.name} account</p>
                            <p><strong>3.</strong> Pipedream will automatically create a workflow that sends form responses to CheckinAI</p>
                            <p><strong>4.</strong> Your integration will be ready immediately!</p>
                            <div className="mt-3 pt-3 border-t border-blue-200">
                              <p className="text-xs text-blue-700">
                                <strong>Webhook endpoint:</strong> Data will be sent to your secure CheckinAI webhook automatically
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        onClick={() => setSelectedType(null)}
                        className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                        disabled={isConnecting}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handlePipedreamConnect(selectedType)}
                        disabled={isConnecting}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        {isConnecting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Connecting...
                          </>
                        ) : (
                          <>
                            <ExternalLink className="w-4 h-4" />
                            Connect {INTEGRATION_TYPES.find(t => t.id === selectedType)?.name}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IntegrationSetupModal