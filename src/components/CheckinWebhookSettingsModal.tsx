import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Webhook, Shield, ExternalLink, LogOut, Copy, RefreshCw } from 'lucide-react';
import { checkinWebhookService, supabase } from '../lib/supabase';

interface CheckinWebhookSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  canEdit?: boolean;
}

const CheckinWebhookSettingsModal: React.FC<CheckinWebhookSettingsModalProps> = ({ isOpen, onClose, onSave, canEdit = true }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [webhookToken, setWebhookToken] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<{
    connectedAt?: string;
  }>({});
  
  // Client matching settings
  const [primaryIdentifier, setPrimaryIdentifier] = useState<'phone' | 'email'>('phone');
  const [fallbackIdentifier, setFallbackIdentifier] = useState<'phone' | 'email' | 'none'>('email');
  const [autoCreateClients, setAutoCreateClients] = useState(true);
  const [newClientStatus, setNewClientStatus] = useState<'active' | 'inactive' | 'paused'>('active');
  const [newClientEngagement, setNewClientEngagement] = useState<'low' | 'medium' | 'high'>('medium');

  // Generate webhook URL with user ID and token
  const webhookUrl = currentUserId && webhookToken 
    ? `${window.location.origin}/webhook-checkin/${currentUserId}/${webhookToken}`
    : currentUserId 
      ? 'Click "Generate Webhook URL" to create your unique webhook link'
      : 'Loading user information...';

  useEffect(() => {
    if (isOpen) {
      getCurrentUser();
      checkConnectionStatus();
    }
  }, [isOpen]);

  const getCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  };
  const checkConnectionStatus = async () => {
    try {
      const settings = await checkinWebhookService.getUserCheckinWebhookSettings();
      console.log('🔍 [Webhook Modal] Connection status check: settings =', settings);
      if (settings?.webhook_secret) {
        setIsConnected(true);
        setWebhookToken(settings.webhook_secret);
        setConnectionInfo({
          connectedAt: settings.created_at
        });
        
        // Load client matching settings
        setPrimaryIdentifier(settings.primary_identifier || 'phone');
        setFallbackIdentifier(settings.fallback_identifier || 'email');
        setAutoCreateClients(settings.auto_create_clients !== false);
        setNewClientStatus(settings.new_client_status || 'active');
        setNewClientEngagement(settings.new_client_engagement || 'medium');
        
        console.log('✅ [Webhook Modal] Webhook is connected with token:', settings.webhook_secret);
      } else {
        setIsConnected(false);
        setWebhookToken('');
        setConnectionInfo({});
        console.log('⚠️ [Webhook Modal] No webhook configured');
      }
    } catch (error) {
      console.error('Error checking connection status:', error);
    }
  };

  const generateWebhookToken = () => {
    const token = checkinWebhookService.generateUniqueWebhookToken();
    setWebhookToken(token);
  };

  const handleSaveWebhook = async () => {
    if (!webhookToken?.trim()) {
      setError('Please generate a webhook URL first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const success = await checkinWebhookService.updateCheckinWebhookSettings({
        webhook_secret: webhookToken.trim(),
        primary_identifier: primaryIdentifier,
        fallback_identifier: fallbackIdentifier,
        auto_create_clients: autoCreateClients,
        new_client_status: newClientStatus,
        new_client_engagement: newClientEngagement
      });

      if (success) {
        setIsConnected(true);
        setSuccess(true);
        console.log('✅ [Webhook Modal] Webhook settings saved successfully. Token:', webhookToken);
        setTimeout(() => {
          onSave();
          onClose();
        }, 1500);
      } else {
        setError('Failed to save webhook settings');
        console.error('❌ [Webhook Modal] Failed to save webhook settings, updateCheckinWebhookSettings returned false');
      }
    } catch (error) {
      console.error('Error saving webhook settings:', error);
      setError('Failed to save webhook settings');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your webhook? This will stop receiving check-in data.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const success = await checkinWebhookService.deleteCheckinWebhookSettings();
      if (success) {
        setIsConnected(false);
        setWebhookToken('');
        setConnectionInfo({});
        setSuccess(true);
        setTimeout(() => {
          onSave();
          onClose();
        }, 1500);
      } else {
        setError('Failed to disconnect webhook');
      }
    } catch (error) {
      console.error('Error disconnecting webhook:', error);
      setError('Failed to disconnect webhook');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">
            {canEdit ? 'Webhook Configuration' : 'Webhook Information'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors duration-200"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Success Message */}
          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-700 text-sm">
                {isConnected ? 'Webhook configured successfully!' : 'Webhook disconnected successfully!'}
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {/* Connection Status */}
          {isConnected ? (
            <div className="space-y-6">
              {/* Connected Status */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <Shield className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-800">Webhook Connected</h3>
                    <p className="text-green-600 text-sm">
                      {canEdit ? 'Your account is securely connected with automatic token refresh' : 'The webhook is configured and receiving check-ins'}
                    </p>
                  </div>
                </div>

                {/* Connection Details */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-green-200 last:border-b-0">
                    <span className="text-sm font-medium text-green-700">Webhook URL:</span>
                    <div className="flex items-center space-x-2">
                      <code className="text-sm text-green-600 font-mono bg-green-100 px-2 py-1 rounded">
                        {webhookUrl}
                      </code>
                      <button
                        onClick={() => copyToClipboard(webhookUrl)}
                        className="p-1 hover:bg-green-200 rounded transition-colors duration-200"
                        title="Copy webhook URL"
                      >
                        <Copy className="w-4 h-4 text-green-600" />
                      </button>
                    </div>
                  </div>
                  {connectionInfo.connectedAt && (
                    <div className="flex justify-between items-center py-2 border-b border-green-200 last:border-b-0">
                      <span className="text-sm font-medium text-green-700">Connected:</span>
                      <span className="text-sm text-green-600">
                        {new Date(connectionInfo.connectedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium text-green-700">Status:</span>
                    <span className="text-sm text-green-600 flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>Active</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4">
                {canEdit ? (
                  <button
                    onClick={handleDisconnect}
                    disabled={loading}
                    className="text-red-600 hover:text-red-700 text-sm font-medium transition-colors duration-200 disabled:opacity-50 flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Disconnect Account</span>
                  </button>
                ) : (
                  <div></div>
                )}
                <button
                  onClick={onClose}
                  className="bg-slate-100 text-slate-700 px-6 py-2 rounded-lg font-medium hover:bg-slate-200 transition-all duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Webhook Setup */}
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto">
                  <Webhook className="w-8 h-8 text-teal-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">Configure Your Webhook</h3>
                  <p className="text-slate-600">
                    {canEdit 
                      ? 'Set up a webhook to automatically receive check-in transcripts from your external system.'
                      : 'Contact your coach to set up the webhook for automatic check-in processing.'
                    }
                  </p>
                </div>
              </div>

              {/* Webhook URL Display */}
              {canEdit && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h4 className="font-medium text-slate-700 mb-2">Webhook URL</h4>
                  <div className="flex items-center space-x-2">
                    <code className={`flex-1 px-3 py-2 rounded text-sm font-mono ${
                      webhookToken 
                        ? 'bg-slate-100 text-slate-800' 
                        : 'bg-slate-50 text-slate-500 italic'
                    }`}>
                      {webhookUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(webhookUrl)}
                      disabled={!webhookToken}
                      className="p-2 hover:bg-slate-200 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Copy webhook URL"
                    >
                      <Copy className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                  {!webhookToken && (
                    <p className="text-xs text-slate-500 mt-2">
                      Generate a webhook URL to get started
                    </p>
                  )}
                </div>
              )}

              {/* Generate Webhook URL Button */}
              {!webhookToken && canEdit && (
                <div className="text-center">
                  <button
                    onClick={generateWebhookToken}
                    disabled={loading}
                    className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:from-teal-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2 mx-auto shadow-md hover:shadow-lg"
                  >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Generate Webhook URL</span>
                  </button>
                </div>
              )}

              {/* Regenerate Button (when token exists) */}
              {webhookToken && canEdit && (
                <div className="text-center">
                  <button
                    onClick={generateWebhookToken}
                    disabled={loading}
                    className="text-teal-600 hover:text-teal-700 text-sm font-medium transition-colors duration-200 disabled:opacity-50 flex items-center space-x-2 mx-auto"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span>Regenerate URL</span>
                  </button>
                </div>
              )}

              {/* Client Matching Settings */}
              {webhookToken && canEdit && (
                <div className="border border-slate-200 rounded-lg p-4">
                  <h4 className="font-medium text-slate-700 mb-4">Client Matching Configuration</h4>
                  
                  <div className="space-y-4">
                    {/* Primary Identifier */}
                    <div>
                      <label htmlFor="primary-identifier" className="block text-sm font-medium text-slate-600 mb-2">
                        Primary identifier for matching clients
                      </label>
                      <select
                        id="primary-identifier"
                        value={primaryIdentifier}
                        onChange={(e) => setPrimaryIdentifier(e.target.value as 'phone' | 'email')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="phone">Phone Number</option>
                        <option value="email">Email Address</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        CheckinAI will first try to match clients using this identifier
                      </p>
                    </div>

                    {/* Fallback Identifier */}
                    <div>
                      <label htmlFor="fallback-identifier" className="block text-sm font-medium text-slate-600 mb-2">
                        Fallback identifier
                      </label>
                      <select
                        id="fallback-identifier"
                        value={fallbackIdentifier}
                        onChange={(e) => setFallbackIdentifier(e.target.value as 'phone' | 'email' | 'none')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="none">None</option>
                        <option value="phone" disabled={primaryIdentifier === 'phone'}>Phone Number</option>
                        <option value="email" disabled={primaryIdentifier === 'email'}>Email Address</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        If primary identifier fails, try this method
                      </p>
                    </div>

                    {/* Auto-create Clients */}
                    <div>
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={autoCreateClients}
                          onChange={(e) => setAutoCreateClients(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-slate-600">
                          Automatically create new clients
                        </span>
                      </label>
                      <p className="text-xs text-slate-500 mt-1 ml-7">
                        When enabled, unknown clients will be created automatically. When disabled, check-ins from unknown clients will be rejected.
                      </p>
                    </div>

                    {/* New Client Defaults (only show if auto-create is enabled) */}
                    {autoCreateClients && (
                      <div className="bg-slate-50 rounded-lg p-3 space-y-3">
                        <h5 className="text-sm font-medium text-slate-700">New client defaults:</h5>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="new-client-status" className="block text-xs font-medium text-slate-600 mb-1">
                              Status
                            </label>
                            <select
                              id="new-client-status"
                              value={newClientStatus}
                              onChange={(e) => setNewClientStatus(e.target.value as 'active' | 'inactive' | 'paused')}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                              <option value="paused">Paused</option>
                            </select>
                          </div>
                          
                          <div>
                            <label htmlFor="new-client-engagement" className="block text-xs font-medium text-slate-600 mb-1">
                              Engagement Level
                            </label>
                            <select
                              id="new-client-engagement"
                              value={newClientEngagement}
                              onChange={(e) => setNewClientEngagement(e.target.value as 'low' | 'medium' | 'high')}
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Benefits */}
              {canEdit ? (
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                  <h4 className="font-medium text-teal-800 mb-3">Benefits of webhook integration:</h4>
                  <ul className="text-teal-700 text-sm space-y-2">
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>Automatic check-in transcript ingestion</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>Real-time smart recall and pattern analysis</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>Secure authentication with unique URL</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>Simple copy-paste setup in GoHighLevel</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-teal-600" />
                      <span>No technical configuration required</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-3">Webhook benefits:</h4>
                  <ul className="text-blue-700 text-sm space-y-2">
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-blue-600" />
                      <span>Automatic check-in transcript processing</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-blue-600" />
                      <span>Real-time smart recall and pattern analysis</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-blue-600" />
                      <span>Seamless integration with coaching workflow</span>
                    </li>
                  </ul>
                </div>
              )}

              {/* Save Button (only show when token exists) */}
              {webhookToken && canEdit && (
                <button
                  onClick={handleSaveWebhook}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-teal-600 to-emerald-700 text-white py-4 px-6 rounded-lg font-medium hover:from-teal-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl"
                >
                  <Webhook className="w-5 h-5" />
                  <span>{loading ? 'Saving...' : 'Activate Webhook URL'}</span>
                </button>
              )}

              {/* Close Button */}
              <div className="flex justify-end pt-4">
                <button
                  onClick={onClose}
                  className="px-6 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckinWebhookSettingsModal;