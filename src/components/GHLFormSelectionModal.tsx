import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Loader, FileText, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface GHLForm {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

interface SelectedForm {
  form_id: string;
  form_name: string;
}

interface GHLFormSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  integrationId: string;
  locationId: string;
  onFormsSelected: () => void;
}

function GHLFormSelectionModal({
  isOpen,
  onClose,
  integrationId,
  locationId,
  onFormsSelected,
}: GHLFormSelectionModalProps) {
  const [forms, setForms] = useState<GHLForm[]>([]);
  const [selectedForms, setSelectedForms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available forms and currently selected forms
  useEffect(() => {
    if (isOpen) {
      loadForms();
      loadSelectedForms();
    }
  }, [isOpen, integrationId]);

  const loadForms = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ghl-get-forms?integration_id=${integrationId}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch forms');
      }

      const data = await response.json();
      setForms(data.forms || []);
    } catch (err) {
      console.error('Error loading forms:', err);
      setError(err instanceof Error ? err.message : 'Failed to load forms');
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedForms = async () => {
    try {
      const { data, error } = await supabase
        .from('ghl_form_selections')
        .select('form_id')
        .eq('integration_id', integrationId)
        .eq('is_active', true);

      if (error) throw error;

      const selected = new Set(data.map(item => item.form_id));
      setSelectedForms(selected);
    } catch (err) {
      console.error('Error loading selected forms:', err);
    }
  };

  const toggleFormSelection = (formId: string) => {
    setSelectedForms(prev => {
      const newSet = new Set(prev);
      if (newSet.has(formId)) {
        newSet.delete(formId);
      } else {
        newSet.add(formId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get current selections from database
      const { data: currentSelections, error: fetchError } = await supabase
        .from('ghl_form_selections')
        .select('form_id, id')
        .eq('integration_id', integrationId);

      if (fetchError) throw fetchError;

      const currentFormIds = new Set(currentSelections?.map(s => s.form_id) || []);
      const selectedFormIds = selectedForms;

      // Forms to add (selected but not in database)
      const toAdd = Array.from(selectedFormIds).filter(id => !currentFormIds.has(id));
      
      // Forms to remove (in database but not selected)
      const toRemove = Array.from(currentFormIds).filter(id => !selectedFormIds.has(id));

      // Add new selections
      if (toAdd.length > 0) {
        const insertData = toAdd.map(formId => {
          const form = forms.find(f => f.id === formId);
          return {
            user_id: user.id,
            integration_id: integrationId,
            form_id: formId,
            form_name: form?.name || 'Unknown Form',
            location_id: locationId,
            is_active: true,
          };
        });

        const { error: insertError } = await supabase
          .from('ghl_form_selections')
          .insert(insertData);

        if (insertError) throw insertError;
      }

      // Remove deselected forms
      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('ghl_form_selections')
          .delete()
          .eq('integration_id', integrationId)
          .in('form_id', toRemove);

        if (deleteError) throw deleteError;
      }

      onFormsSelected();
      onClose();
    } catch (err) {
      console.error('Error saving form selections:', err);
      setError(err instanceof Error ? err.message : 'Failed to save selections');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Select Forms to Monitor</h2>
            <p className="text-sm text-gray-600 mt-1">
              Choose which forms should send submissions to CheckinAI
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <Loader className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading forms...</p>
            </div>
          ) : forms.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No forms found</h3>
              <p className="text-gray-500">
                Create forms in your GoHighLevel account to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {forms.map((form) => (
                <label
                  key={form.id}
                  className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedForms.has(form.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedForms.has(form.id)}
                    onChange={() => toggleFormSelection(form.id)}
                    className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className={`w-5 h-5 ${selectedForms.has(form.id) ? 'text-blue-600' : 'text-gray-400'}`} />
                        <h4 className="font-semibold text-gray-900">{form.name}</h4>
                      </div>
                      {selectedForms.has(form.id) && (
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    {form.description && (
                      <p className="text-sm text-gray-600 mt-1">{form.description}</p>
                    )}
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                      <span>Updated: {new Date(form.updated_at).toLocaleDateString()}</span>
                      {!form.is_active && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">Inactive</span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {forms.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Selected: {selectedForms.size} form{selectedForms.size !== 1 ? 's' : ''}</strong>
                {selectedForms.size > 0 && (
                  <span className="block mt-1">
                    Submissions from selected forms will automatically create check-ins in CheckinAI.
                  </span>
                )}
              </p>
            </div>
          )}
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
            disabled={saving || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Selection'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GHLFormSelectionModal;

