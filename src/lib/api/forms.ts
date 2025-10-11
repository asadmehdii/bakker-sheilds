import { supabase } from './supabase';

export interface Form {
  id: string;
  name: string;
  url: string;
  submission_count?: number;
  last_submission?: string;
}

export interface FormApiResponse {
  forms: Form[];
  error?: string;
}

// Fetch forms for a specific integration
export async function fetchIntegrationForms(integrationId: string): Promise<FormApiResponse> {
  try {
    const { data: integration, error: integrationError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (integrationError || !integration) {
      return { forms: [], error: 'Integration not found' };
    }

    // Call the appropriate API based on integration type
    switch (integration.type) {
      case 'typeform':
        return await fetchTypeformForms(integration);
      case 'google_forms':
        return await fetchGoogleForms(integration);
      case 'ghl':
        return await fetchGHLForms(integration);
      case 'custom_webhook':
        return { forms: [], error: 'Custom webhooks do not have forms' };
      default:
        return { forms: [], error: 'Unknown integration type' };
    }
  } catch (error) {
    console.error('Error fetching integration forms:', error);
    return { forms: [], error: 'Failed to fetch forms' };
  }
}

// Fetch Typeform forms
async function fetchTypeformForms(integration: any): Promise<FormApiResponse> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { forms: [], error: 'User not authenticated' };
    }

    // Call Supabase Edge Function to fetch Typeform forms
    const { data, error } = await supabase.functions.invoke('fetch-typeform-forms', {
      body: {
        integration_id: integration.id,
        user_id: user.id
      }
    });

    if (error) {
      console.error('Typeform API error:', error);
      return { forms: [], error: 'Failed to fetch Typeform forms' };
    }

    return { forms: data.forms || [] };
  } catch (error) {
    console.error('Error fetching Typeform forms:', error);
    return { forms: [], error: 'Failed to fetch Typeform forms' };
  }
}

// Fetch Google Forms
async function fetchGoogleForms(integration: any): Promise<FormApiResponse> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { forms: [], error: 'User not authenticated' };
    }

    // Call Supabase Edge Function to fetch Google Forms
    const { data, error } = await supabase.functions.invoke('fetch-google-forms', {
      body: {
        integration_id: integration.id,
        user_id: user.id
      }
    });

    if (error) {
      console.error('Google Forms API error:', error);
      return { forms: [], error: 'Failed to fetch Google Forms' };
    }

    return { forms: data.forms || [] };
  } catch (error) {
    console.error('Error fetching Google Forms:', error);
    return { forms: [], error: 'Failed to fetch Google Forms' };
  }
}

// Fetch GHL forms
async function fetchGHLForms(integration: any): Promise<FormApiResponse> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { forms: [], error: 'User not authenticated' };
    }

    // Call existing GHL forms API
    const { data, error } = await supabase.functions.invoke('ghl-get-forms', {
      body: {
        integration_id: integration.id,
        user_id: user.id
      }
    });

    if (error) {
      console.error('GHL API error:', error);
      return { forms: [], error: 'Failed to fetch GHL forms' };
    }

    return { forms: data.forms || [] };
  } catch (error) {
    console.error('Error fetching GHL forms:', error);
    return { forms: [], error: 'Failed to fetch GHL forms' };
  }
}

// Track form submission (called when user fills out a form)
export async function trackFormSubmission(integrationId: string, formId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }

    // Update submission count in form_selections table
    const { error } = await supabase
      .from('form_selections')
      .update({
        submission_count: supabase.sql`submission_count + 1`,
        last_submission: new Date().toISOString()
      })
      .eq('integration_id', integrationId)
      .eq('form_id', formId);

    if (error) {
      console.error('Error tracking form submission:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error tracking form submission:', error);
    return false;
  }
}



