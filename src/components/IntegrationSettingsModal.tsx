import { useState, useEffect } from 'react';
import { X, Settings, ExternalLink, Trash2, Copy, Eye, EyeOff, FileText } from 'lucide-react';
import GHLFormSelectionModal from './GHLFormSelectionModal';
import { supabase } from '../lib/supabase';

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

interface IntegrationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  integration: Integration | null;
  onSave: (integration: Integration) => void;
  onDelete: (integrationId: string) => void;
}

function IntegrationSettingsModal({ 
  isOpen, 
  onClose, 
  integration, 
  onSave, 
  onDelete 
}: IntegrationSettingsModalProps) {
  const [editedIntegration, setEditedIntegration] = useState<Integration | null>(null);
  const [showWebhookUrl, setShowWebhookUrl] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showFormSelection, setShowFormSelection] = useState(false);
  const [selectedForms, setSelectedForms] = useState<any[]>([]);

  useEffect(() => {
    if (integration) {
      setEditedIntegration({ ...integration });
      
      // Load selected forms for GHL integrations
      if (integration.type === 'ghl') {
        loadSelectedForms();
      }
    }
  }, [integration]);

  const loadSelectedForms = async () => {
    if (!integration || integration.type !== 'ghl') return;

    try {
      const { data, error } = await supabase
        .from('ghl_form_selections')
        .select('*')
        .eq('integration_id', integration.id)
        .eq('is_active', true);

      if (error) throw error;
      setSelectedForms(data || []);
    } catch (error) {
      console.error('Error loading selected forms:', error);
    }
  };

  const handleSave = async () => {
    if (!editedIntegration) return;
    
    setIsSaving(true);
    try {
      onSave(editedIntegration);
      onClose();
    } catch (error) {
      console.error('Error saving integration:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!integration) return;
    
    if (!confirm('Are you sure you want to delete this integration? This cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      onDelete(integration.id);
      onClose();
    } catch (error) {
      console.error('Error deleting integration:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNameChange = (name: string) => {
    if (editedIntegration) {
      setEditedIntegration({ ...editedIntegration, name });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  const openInPipedream = () => {
    if (integration?.config?.workflow_id) {
      window.open(`https://pipedream.com/workflows/${integration.config.workflow_id}`, '_blank');
    }
  };

  if (!isOpen || !integration || !editedIntegration) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Integration Settings</h2>
              <p className="text-sm text-gray-600">{integration.type.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Integration Name
                  </label>
                  <input
                    type="text"
                    value={editedIntegration.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter integration name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <div className={`px-3 py-2 rounded-lg text-sm font-medium ${
                    integration.status === 'connected' 
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : integration.status === 'pending'
                      ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' 
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {integration.status}
                  </div>
                </div>
              </div>
            </div>

            {/* Configuration Details */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h3>
              <div className="space-y-4">
                {/* Webhook URL for custom webhooks */}
                {integration.type === 'custom_webhook' && integration.config?.webhook_url && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Webhook URL
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono">
                        {showWebhookUrl 
                          ? integration.config.webhook_url 
                          : '•'.repeat(40) + integration.config.webhook_url.slice(-10)
                        }
                      </div>
                      <button
                        onClick={() => setShowWebhookUrl(!showWebhookUrl)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
                        title={showWebhookUrl ? 'Hide URL' : 'Show URL'}
                      >
                        {showWebhookUrl ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(integration.config.webhook_url)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
                        title="Copy URL"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Workflow ID for Pipedream integrations */}
                {(integration.type === 'typeform' || integration.type === 'google_forms') && integration.config?.workflow_id && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pipedream Workflow ID
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono">
                        {integration.config.workflow_id}
                      </div>
                      <button
                        onClick={() => copyToClipboard(integration.config.workflow_id)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
                        title="Copy Workflow ID"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={openInPipedream}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
                        title="Open in Pipedream"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* GHL Location and Form Selection */}
                {integration.type === 'ghl' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      GHL Location
                    </label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm">
                      {integration.config?.location_id || 'Connected'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* GHL Selected Forms */}
            {integration.type === 'ghl' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Selected Forms</h3>
                  <button
                    onClick={() => setShowFormSelection(true)}
                    className="px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Manage Forms
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedForms.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                      <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">No forms selected yet</p>
                      <button
                        onClick={() => setShowFormSelection(true)}
                        className="mt-2 text-sm text-purple-600 hover:text-purple-700"
                      >
                        Select Forms →
                      </button>
                    </div>
                  ) : (
                    selectedForms.map((form) => (
                      <div
                        key={form.id}
                        className="flex items-center p-3 bg-purple-50 border border-purple-200 rounded-lg"
                      >
                        <FileText className="w-5 h-5 text-purple-600 mr-3" />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{form.form_name}</p>
                          <p className="text-xs text-gray-500">
                            Added {new Date(form.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Statistics */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Submissions</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {integration.total_submissions || 0}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Created</p>
                  <p className="text-sm font-medium text-gray-900">
                    {integration.created_at 
                      ? new Date(integration.created_at).toLocaleDateString()
                      : 'Unknown'
                    }
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Last Activity</p>
                  <p className="text-sm font-medium text-gray-900">
                    {integration.last_activity 
                      ? new Date(integration.last_activity).toLocaleDateString()
                      : 'No activity'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-red-700 mb-4">Danger Zone</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-red-800">Delete Integration</h4>
                    <p className="text-sm text-red-600">
                      This will permanently delete the integration and cannot be undone.
                    </p>
                  </div>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* GHL Form Selection Modal */}
      {integration?.type === 'ghl' && (
        <GHLFormSelectionModal
          isOpen={showFormSelection}
          onClose={() => setShowFormSelection(false)}
          integrationId={integration.id}
          locationId={integration.config?.location_id}
          onFormsSelected={() => {
            loadSelectedForms();
            setShowFormSelection(false);
          }}
        />
      )}
    </div>
  );
}

export default IntegrationSettingsModal;