import React, { useState, useEffect } from 'react';
import { ChevronDown, ExternalLink, FileText, Users, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Form {
  id: string;
  name: string;
  url: string;
  submission_count?: number;
  last_submission?: string;
}

interface FormSelectionDropdownProps {
  integration: {
    id: string;
    type: string;
    name: string;
    status: string;
    config?: any;
  };
  onFormSelect?: (form: Form) => void;
}

export default function FormSelectionDropdown({ integration, onFormSelect }: FormSelectionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [forms, setForms] = useState<Form[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchForms = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }
      
      console.log('👤 [FormSelectionDropdown] Current user ID:', user.id);

      console.log('🔍 Fetching forms for integration:', {
        id: integration.id,
        type: integration.type,
        name: integration.name,
        config: integration.config
      });

      // Fetch real submission counts from database
      let realForms: Form[] = [];

      switch (integration.type) {
        case 'typeform':
          // Get real submission count from checkins table
          const { data: allTypeformCheckins } = await supabase
            .from('checkins')
            .select('id, date, raw_data')
            .eq('coach_id', user.id)
            .order('date', { ascending: false });

          // Filter by source in JavaScript
          const typeformCheckins = allTypeformCheckins?.filter(checkin => 
            checkin.raw_data?.source === 'typeform'
          ) || [];

          const typeformCount = typeformCheckins.length;
          const lastTypeformSubmission = typeformCheckins[0]?.date;

          realForms = [
            {
              id: 'UvFAxMwQ',
              name: 'Client Check-in Form',
              url: 'https://form.typeform.com/to/UvFAxMwQ',
              submission_count: typeformCount,
              last_submission: lastTypeformSubmission
            }
          ];
          break;
        case 'google_forms':
          // Get real submission count from checkins table
          const { data: allCheckins } = await supabase
            .from('checkins')
            .select('id, date, raw_data')
            .eq('coach_id', user.id)
            .order('date', { ascending: false });

          // Filter by source in JavaScript
          const googleCheckins = allCheckins?.filter(checkin => 
            checkin.raw_data?.source === 'google_forms'
          ) || [];

          console.log('🔍 [FormSelectionDropdown] Google Forms checkins found:', googleCheckins);
          const googleCount = googleCheckins.length;
          const lastGoogleSubmission = googleCheckins[0]?.date;

          realForms = [
            {
              id: 'D1CzdXMAxYTrx7fz5',
              name: 'Client Feedback Form',
              url: 'https://forms.gle/D1CzdXMAxYTrx7fz5',
              submission_count: googleCount,
              last_submission: lastGoogleSubmission
            }
          ];
          break;
        case 'ghl':
          // Get real submission count from checkins table for GHL
          const { data: allGhlCheckins } = await supabase
            .from('checkins')
            .select('id, date, raw_data')
            .eq('coach_id', user.id)
            .order('date', { ascending: false });

          // Filter by source in JavaScript
          const ghlCheckins = allGhlCheckins?.filter(checkin => 
            checkin.raw_data?.source === 'ghl'
          ) || [];

          const ghlCount = ghlCheckins.length;
          const lastGhlSubmission = ghlCheckins[0]?.date;

          realForms = [
            {
              id: 'JuBWZmn2UxztHcS7VLwb',
              name: 'GHL Form',
              url: 'https://link.carpediemuk.com/widget/form/JuBWZmn2UxztHcS7VLwb?notrack=true',
              submission_count: ghlCount,
              last_submission: lastGhlSubmission
            }
          ];
          break;
        default:
          throw new Error('Unsupported integration type');
      }

      console.log('✅ Real forms created:', realForms);
      setForms(realForms);

    } catch (err) {
      console.error('Error fetching forms:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch forms');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormClick = (form: Form) => {
    // Open form in new tab
    window.open(form.url, '_blank', 'noopener,noreferrer');
    
    // Call callback if provided
    if (onFormSelect) {
      onFormSelect(form);
    }
    
    // Close dropdown
    setIsOpen(false);
  };

  const getPlatformIcon = () => {
    switch (integration.type) {
      case 'typeform':
        return <FileText className="w-4 h-4" />;
      case 'google_forms':
        return <FileText className="w-4 h-4" />;
      case 'ghl':
        return <Users className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getPlatformColor = () => {
    switch (integration.type) {
      case 'typeform':
        return 'text-gray-600';
      case 'google_forms':
        return 'text-blue-600';
      case 'ghl':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (!isOpen) {
            fetchForms();
          }
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        disabled={integration.status !== 'connected'}
      >
        {getPlatformIcon()}
        <span>Select Form</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-900">
              {integration.name} - Available Forms
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Click any form to open and fill it out
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {isLoading && (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Loading forms...</p>
              </div>
            )}

            {error && (
              <div className="p-4 text-center">
                <p className="text-sm text-red-600">{error}</p>
                <button
                  onClick={fetchForms}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Try again
                </button>
              </div>
            )}

            {!isLoading && !error && forms.length === 0 && (
              <div className="p-4 text-center">
                <p className="text-sm text-gray-500">No forms found</p>
                <p className="text-xs text-gray-400 mt-1">
                  Make sure you have forms created in {integration.name}
                </p>
              </div>
            )}

            {!isLoading && !error && forms.length > 0 && (
              <div className="p-2">
                {forms.map((form) => (
                  <button
                    key={form.id}
                    onClick={() => handleFormClick(form)}
                    className="w-full p-3 text-left hover:bg-gray-50 rounded-lg transition-colors group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getPlatformIcon()}
                          <h4 className="text-sm font-medium text-gray-900 truncate">
                            {form.name}
                          </h4>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          {form.submission_count !== undefined && (
                            <div className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>{form.submission_count} submissions</span>
                            </div>
                          )}
                          
                          {form.last_submission && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>
                                {new Date(form.last_submission).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-100">
            <button
              onClick={() => setIsOpen(false)}
              className="w-full text-xs text-gray-500 hover:text-gray-700 text-center"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}