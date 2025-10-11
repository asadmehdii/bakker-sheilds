import React, { useState, useEffect } from 'react';
import { Plus, Settings, Trash2, ExternalLink, AlertCircle, CheckCircle, Clock, Zap, FileText, Globe } from 'lucide-react';
import IntegrationSetupModal from '../components/IntegrationSetupModal';
import IntegrationSettingsModal from '../components/IntegrationSettingsModal';
import FormSelectionDropdown from '../components/FormSelectionDropdown';
import Navigation from '../components/Navigation';
import { userService, supabase } from '../lib/supabase';

// Debug: Check if userService functions exist
console.log('🔍 [IntegrationsPage] userService:', userService);
console.log('🔍 [IntegrationsPage] deleteIntegration exists:', typeof userService.deleteIntegration);
console.log('🔍 [IntegrationsPage] updateIntegration exists:', typeof userService.updateIntegration);

// Test: Try to add the functions manually
if (!userService.deleteIntegration) {
  console.log('🔧 [IntegrationsPage] Adding deleteIntegration manually');
  userService.deleteIntegration = async (integrationId: string) => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }
    const { error } = await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integrationId)
      .eq('user_id', user.id);
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };
}

if (!userService.updateIntegration) {
  console.log('🔧 [IntegrationsPage] Adding updateIntegration manually');
  userService.updateIntegration = async (integrationId: string, updates: any) => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }
    const { data: integration, error } = await supabase
      .from('user_integrations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', integrationId)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, integration };
  };
}

interface Integration {
  id: string;
  type: 'typeform' | 'google_forms' | 'custom_webhook' | 'ghl';
  name: string;
  status: 'connected' | 'disconnected' | 'pending';
  config: any;
  created_at?: string;
  last_activity?: string;
  total_submissions?: number;
}

const INTEGRATION_ICONS = {
  typeform: FileText,
  google_forms: Globe,
  custom_webhook: Zap,
  ghl: Zap
};

const INTEGRATION_COLORS = {
  typeform: 'from-gray-600 to-gray-700',
  google_forms: 'from-blue-600 to-blue-700',
  custom_webhook: 'from-purple-600 to-purple-700',
  ghl: 'from-purple-600 to-indigo-700'
};

function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Load real user integrations
  useEffect(() => {
    const loadIntegrations = async () => {
      try {
        console.log('🔄 [IntegrationsPage] Loading integrations...');
        setIsLoading(true);
        const userIntegrations = await userService.getUserIntegrations();
        console.log('📋 [IntegrationsPage] Received integrations:', userIntegrations);
        setIntegrations(userIntegrations);
      } catch (error) {
        console.error('❌ [IntegrationsPage] Error loading integrations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadIntegrations();

    // Check for OAuth success callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setShowSuccessMessage(true);
      // Clear the URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      // Reload integrations to get the new GHL integration
      setTimeout(() => loadIntegrations(), 500);
      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccessMessage(false), 3000);
    }
  }, []);

  const handleAddIntegration = async (newIntegration: Integration) => {
    // Add the integration temporarily for immediate UI feedback
    setIntegrations(prev => [...prev, { 
      ...newIntegration, 
      created_at: new Date().toISOString(),
      total_submissions: 0
    }]);

    // Refresh the integrations list to get the latest data
    try {
      const userIntegrations = await userService.getUserIntegrations();
      setIntegrations(userIntegrations);
    } catch (error) {
      console.error('Error refreshing integrations:', error);
    }
  };

  const handleDeleteIntegration = async (integrationId: string) => {
    try {
      // Call the backend API to delete the integration
      const result = await userService.deleteIntegration(integrationId);
      
      if (result.success) {
        // Remove from local state only after successful backend deletion
        setIntegrations(prev => prev.filter(i => i.id !== integrationId));
        console.log('✅ Integration deleted successfully');
      } else {
        console.error('❌ Failed to delete integration:', result.error);
        // You could show a toast notification here
        alert(`Failed to delete integration: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Error deleting integration:', error);
      alert('An unexpected error occurred while deleting the integration');
    }
  };

  const handleOpenSettings = (integration: Integration) => {
    setSelectedIntegration(integration);
    setIsSettingsModalOpen(true);
  };

  const handleUpdateIntegration = async (updatedIntegration: Integration) => {
    try {
      // Call the backend API to update the integration
      const result = await userService.updateIntegration(updatedIntegration.id, {
        name: updatedIntegration.name,
        config: updatedIntegration.config
      });
      
      if (result.success && result.integration) {
        // Update local state with the backend response
        setIntegrations(prev => 
          prev.map(i => i.id === updatedIntegration.id ? {
            ...i,
            name: result.integration.name,
            config: result.integration.config,
            updated_at: result.integration.updated_at
          } : i)
        );
        console.log('✅ Integration updated successfully');
      } else {
        console.error('❌ Failed to update integration:', result.error);
        alert(`Failed to update integration: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Error updating integration:', error);
      alert('An unexpected error occurred while updating the integration');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'disconnected':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'disconnected':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading integrations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Zap className="w-8 h-8 text-blue-600" />
                Integrations
              </h1>
              <p className="mt-2 text-gray-600">
                Connect your forms and surveys to automatically create check-ins
              </p>
            </div>
            <button
              onClick={() => setIsSetupModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Integration
            </button>
          </div>
        </div>

        {/* Success Message */}
        {showSuccessMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Integration Connected Successfully!</p>
              <p className="text-sm text-green-700">You can now select forms to monitor in your integration settings.</p>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 bg-blue-50 rounded-lg">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Integrations</p>
                <p className="text-2xl font-bold text-gray-900">
                  {integrations.filter(i => i.status === 'connected').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Submissions</p>
                <p className="text-2xl font-bold text-gray-900">
                  {integrations.reduce((sum, i) => sum + (i.total_submissions || 0), 0)}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 bg-purple-50 rounded-lg">
                <Settings className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Integration Types</p>
                <p className="text-2xl font-bold text-gray-900">
                  {new Set(integrations.map(i => i.type)).size}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Integrations List */}
        {integrations.length === 0 ? (
          <div className="text-center py-16">
            <div className="p-4 bg-gray-50 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
              <Zap className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No integrations yet</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Connect your forms and surveys to start automatically collecting check-ins from your clients
            </p>
            <button
              onClick={() => setIsSetupModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              Add Your First Integration
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {integrations.map((integration) => {
              const Icon = INTEGRATION_ICONS[integration.type];
              return (
                <div
                  key={integration.id}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className={`p-3 bg-gradient-to-r ${INTEGRATION_COLORS[integration.type]} rounded-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{integration.name}</h3>
                          <span className={`px-3 py-1 text-xs font-medium rounded-full border ${getStatusColor(integration.status)}`}>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(integration.status)}
                              {integration.status}
                            </div>
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Type:</span> {integration.type.replace('_', ' ')}
                          </div>
                          <div>
                            <span className="font-medium">Created:</span> {formatDate(integration.created_at)}
                          </div>
                          <div>
                            <span className="font-medium">Last Activity:</span> {formatDate(integration.last_activity)}
                          </div>
                        </div>
                        
                        {integration.total_submissions !== undefined && (
                          <div className="mt-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${Math.min((integration.total_submissions / 100) * 100, 100)}%` }}
                                ></div>
                              </div>
                              <span className="text-sm font-medium text-gray-900">
                                {integration.total_submissions} submissions
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {/* Form Selection Dropdown - only show for connected integrations that need form selection */}
                      {integration.status === 'connected' && integration.type !== 'custom_webhook' && integration.type !== 'google_forms' && (
                        <FormSelectionDropdown
                          integration={integration}
                          onFormSelect={(form) => {
                            console.log('Form selected:', form);
                            // You can add additional logic here if needed
                          }}
                        />
                      )}
                      
                      {integration.type !== 'custom_webhook' && integration.config?.workflow_id && (
                        <button
                          onClick={() => window.open(`https://pipedream.com/workflows/${integration.config.workflow_id}`, '_blank')}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Open in Pipedream"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenSettings(integration)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                        title="Settings"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Integration Setup Modal */}
      <IntegrationSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onSave={handleAddIntegration}
      />

      {/* Integration Settings Modal */}
      <IntegrationSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => {
          setIsSettingsModalOpen(false);
          setSelectedIntegration(null);
        }}
        integration={selectedIntegration}
        onSave={handleUpdateIntegration}
        onDelete={handleDeleteIntegration}
      />
    </div>
  );
}

export default IntegrationsPage;