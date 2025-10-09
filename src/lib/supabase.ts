import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface ChatSession {
  id: string;
  user_id: string;
  thread_id: string | null;
  title: string;
  last_message_preview: string;
  created_at: string;
  updated_at: string;
  ai_type: string;
  checkin_id: string | null;
  type: 'general' | 'checkin';
  embedding: number[] | null;
  content_summary: string | null;
}

export interface Message {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  sender: 'user' | 'ai';
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  subscription_status: 'free' | 'premium' | 'enterprise';
  subscription_expires_at: string | null;
  created_at: string;
  updated_at: string;
  niche_analysis: string | null;
  niche_analysis_generated_at: string | null;
  has_completed_niche_onboarding: boolean;
  app_role: 'user' | 'coach' | 'admin' | 'super_admin';
}

export interface Client {
  id: string;
  coach_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
  location: string | null;
  goals: string | null;
  notes: string | null;
  status: 'active' | 'inactive' | 'paused';
  engagement_level: 'low' | 'medium' | 'high';
  onboarded_at: string | null;
  last_checkin_at: string | null;
  total_checkins: number;
  tags: string[];
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Checkin {
  id: string;
  coach_id: string;
  client_id: string;
  client_name: string;
  date: string;
  transcript: string | null;
  embedding: number[] | null;
  tags: string[];
  raw_data: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  status: 'pending_response' | 'responded' | 'archived';
  response_session_id: string | null;
  coach_response: string | null;
  response_type: 'written' | 'video' | null;
  response_submitted_at: string | null;
  ai_analysis: string | null;
  ai_analysis_generated_at: string | null;
}

export interface TeamMember {
  id: string;
  coach_id: string;
  member_id: string | null;
  member_email: string | null;
  role: 'assistant_coach' | 'admin';
  status: 'pending_invitation' | 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  invite_token: string | null;
}

export interface AppLog {
  id: string;
  user_id: string | null;
  event_type: string;
  event_details: Record<string, any>;
  timestamp: string;
  context: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user_profiles?: {
    full_name: string;
    email: string;
  } | null;
}

// Database functions
export const chatService = {
  // Get all chat sessions for a specific AI type and user
  async getChatSessions(aiType: string): Promise<ChatSession[]> {
    console.log('🔍 [getChatSessions] Fetching sessions for AI type:', aiType);
    
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('ai_type', aiType)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('❌ [getChatSessions] Error fetching chat sessions:', error);
      return [];
    }

    console.log('✅ [getChatSessions] Retrieved sessions:', data?.length || 0, 'sessions');
    return data || [];
  },

  // Create a new chat session for a specific AI type and current user
  async createChatSession(aiType: string, threadId?: string, checkinId?: string, type: 'general' | 'checkin' = 'general'): Promise<ChatSession | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('❌ [createChatSession] No authenticated user found');
      return null;
    }

    console.log('🆕 [createChatSession] Creating new session for user:', user.id, 'AI type:', aiType, 'Thread ID:', threadId, 'Checkin ID:', checkinId, 'Type:', type);

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        thread_id: threadId,
        title: 'New Chat',
        last_message_preview: '',
        ai_type: aiType,
        checkin_id: checkinId,
        type: type
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [createChatSession] Error creating chat session:', error);
      return null;
    }

    console.log('✅ [createChatSession] Created session:', data.id);
    return data;
  },

  // Update chat session with new message info
  async updateChatSession(sessionId: string, updates: Partial<Pick<ChatSession, 'title' | 'last_message_preview' | 'thread_id'>>): Promise<void> {
    console.log('📝 [updateChatSession] Updating session:', sessionId, 'with updates:', updates);
    
    const { error } = await supabase
      .from('chat_sessions')
      .update(updates)
      .eq('id', sessionId);

    if (error) {
      console.error('❌ [updateChatSession] Error updating chat session:', error);
    } else {
      console.log('✅ [updateChatSession] Successfully updated session:', sessionId);
    }
  },

  // Get messages for a specific chat session
  async getMessages(sessionId: string): Promise<Message[]> {
    console.log('📨 [getMessages] Fetching messages for session:', sessionId);
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ [getMessages] Error fetching messages:', error);
      return [];
    }

    console.log('✅ [getMessages] Retrieved messages for session:', sessionId, '- Count:', data?.length || 0);
    return data || [];
  },

  // Add a new message to a chat session
  async addMessage(sessionId: string, content: string, sender: 'user' | 'ai'): Promise<Message | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('❌ [addMessage] No authenticated user found');
      return null;
    }

    console.log('💬 [addMessage] Adding message to session:', sessionId, 'Sender:', sender);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        content,
        sender
      })
      .select()
      .single();

    if (error) {
      console.error('❌ [addMessage] Error adding message:', error);
      return null;
    }

    console.log('✅ [addMessage] Successfully added message:', data.id, 'to session:', sessionId);
    return data;
  },

  // Delete a chat session and all its messages
  async deleteChatSession(sessionId: string): Promise<void> {
    console.log('🗑️ [deleteChatSession] Deleting session:', sessionId);
    
    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      console.error('❌ [deleteChatSession] Error deleting chat session:', error);
    } else {
      console.log('✅ [deleteChatSession] Successfully deleted session:', sessionId);
    }
  }
};

// User profile functions
export const userService = {
  // Get current user's profile
  async getUserProfile(): Promise<UserProfile | null> {
    console.log('🔍 [User Service] getUserProfile() called');

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.error('❌ [User Service] Error getting authenticated user:', userError);
      return null;
    }

    if (!user) {
      console.log('⚠️ [User Service] No user found when getting profile');
      return null;
    }

    console.log('✅ [User Service] Authenticated user found:', {
      id: user.id,
      email: user.email,
      role: user.role,
      aud: user.aud
    });

    // Check current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('❌ [User Service] Error getting session:', sessionError);
    } else {
      console.log('📋 [User Service] Session info:', {
        hasSession: !!session,
        accessToken: session?.access_token ? `${session.access_token.substring(0, 20)}...` : 'none',
        expiresAt: session?.expires_at,
        userId: session?.user?.id
      });
    }

    // First check if profile exists
    console.log('🔍 [User Service] Querying user_profiles table for user:', user.id);
    const { data: existingProfile, error: checkError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (checkError) {
      console.error('❌ [User Service] Error checking user profile:', {
        code: checkError.code,
        message: checkError.message,
        details: checkError.details,
        hint: checkError.hint
      });

      if (checkError.code === 'PGRST301') {
        console.error('🚫 [User Service] RLS POLICY VIOLATION - User cannot read their own profile!');
        console.error('🔍 [User Service] This means the RLS policy "Users can view own profile" is not working correctly.');
        console.error('🔍 [User Service] Check that auth.uid() = id condition is being evaluated properly.');
      }

      return null;
    }

    // If no profile exists, create one
    if (!existingProfile) {
      console.log('⚠️ [User Service] No profile found, attempting to create one...');
      const { data: newProfile, error: createError } = await supabase
        .from('user_profiles')
        .insert({
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || user.email || '',
          app_role: 'user' // Default role
        })
        .select()
        .maybeSingle();

      if (createError) {
        console.error('❌ [User Service] Error creating user profile:', {
          code: createError.code,
          message: createError.message,
          details: createError.details,
          hint: createError.hint
        });

        if (createError.code === 'PGRST301') {
          console.error('🚫 [User Service] RLS POLICY VIOLATION - User cannot insert their own profile!');
          console.error('🔍 [User Service] This means the RLS policy "Users can insert own profile" is not working correctly.');
        }

        return null;
      }

      console.log('✅ [User Service] Created new user profile:', newProfile);
      return newProfile;
    }

    console.log('✅ [User Service] Retrieved existing user profile:', {
      id: existingProfile.id,
      email: existingProfile.email,
      full_name: existingProfile.full_name,
      app_role: existingProfile.app_role
    });
    return existingProfile;
  },

  // Update user profile
  async updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile | null> {
    console.log('🔍 [User Service] updateUserProfile() called with updates:', updates);

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.error('❌ [User Service] Error getting authenticated user:', userError);
      return null;
    }

    if (!user) {
      console.log('⚠️ [User Service] No user found when updating profile');
      return null;
    }

    console.log('✅ [User Service] Authenticated user found:', user.id);
    console.log('🔍 [User Service] Attempting to update user_profiles table...');

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('❌ [User Service] Error updating user profile:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });

      if (error.code === 'PGRST301') {
        console.error('🚫 [User Service] RLS POLICY VIOLATION - User cannot update their own profile!');
        console.error('🔍 [User Service] This means the RLS policy "Users can update own profile" is not working correctly.');
      }

      return null;
    }

    console.log('✅ [User Service] Updated user profile:', data);
    return data;
  },

  // Get user's webhook URL (generates one if needed)
  async getUserWebhookUrl(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('⚠️ [getUserWebhookUrl] No authenticated user found');
      return null;
    }

    // Get webhook settings to find the token
    const webhookSettings = await checkinWebhookService.getUserCheckinWebhookSettings();
    
    if (webhookSettings?.webhook_secret) {
      // Use existing webhook token
      const webhookUrl = `https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/webhook-checkin/${user.id}/${webhookSettings.webhook_secret}`;
      console.log('✅ [getUserWebhookUrl] Using existing webhook URL');
      return webhookUrl;
    } else {
      // Generate a new webhook token if none exists
      const newToken = crypto.randomUUID();
      
      // Create or update webhook settings with the new token
      const { error } = await supabase
        .from('user_checkin_webhook_settings')
        .upsert({
          user_id: user.id,
          webhook_secret: newToken,
          is_active: true,
          primary_identifier: 'phone',
          fallback_identifier: 'email',
          auto_create_clients: true,
          new_client_status: 'active',
          new_client_engagement: 'medium'
        });

      if (error) {
        console.error('❌ [getUserWebhookUrl] Error creating webhook settings:', error);
        return null;
      }

      const webhookUrl = `https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/webhook-checkin/${user.id}/${newToken}`;
      console.log('✅ [getUserWebhookUrl] Created new webhook URL');
      return webhookUrl;
    }
  },

  // Ensure webhook settings exist for the current user
  async ensureWebhookSettingsExist(integrationName?: string): Promise<{ error?: any }> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { error: 'No authenticated user found' };
    }

    try {
      // Check if webhook settings already exist
      const existingSettings = await checkinWebhookService.getUserCheckinWebhookSettings();
      
      if (existingSettings && existingSettings.webhook_secret) {
        // Update the integration name if provided and settings exist
        if (integrationName) {
          const { error } = await supabase
            .from('user_checkin_webhook_settings')
            .update({
              integration_name: integrationName,
              is_active: true,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
            
          if (error) {
            console.error('Error updating webhook settings:', error);
            return { error };
          }
        }
        
        return {}; // Success - settings already exist
      } else {
        // Create new webhook settings
        const newToken = crypto.randomUUID();
        
        const { error } = await supabase
          .from('user_checkin_webhook_settings')
          .upsert({
            user_id: user.id,
            webhook_secret: newToken,
            integration_name: integrationName || 'Webhook Integration',
            is_active: true,
            primary_identifier: 'phone',
            fallback_identifier: 'email',
            auto_create_clients: true,
            new_client_status: 'active',
            new_client_engagement: 'medium'
          });

        if (error) {
          console.error('Error creating webhook settings:', error);
          return { error };
        }

        return {}; // Success - new settings created
      }
    } catch (error) {
      console.error('Error in ensureWebhookSettingsExist:', error);
      return { error };
    }
  },

  // Get user's current integrations
  async getUserIntegrations(): Promise<any[]> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('⚠️ [getUserIntegrations] No authenticated user found');
      return [];
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      console.log('⚠️ [getUserIntegrations] No effective coach ID');
      return [];
    }

    const integrations: any[] = [];

    // Check for existing webhook integration
    const webhookSettings = await checkinWebhookService.getUserCheckinWebhookSettings();
    if (webhookSettings?.webhook_secret && webhookSettings.is_active) {
      const webhookUrl = `https://xakmijacmllazbmnaxeg.supabase.co/functions/v1/webhook-checkin/${user.id}/${webhookSettings.webhook_secret}`;
      
      // Get some basic stats for the webhook integration
      const { data: checkinsData } = await supabase
        .from('checkins')
        .select('id, date')
        .eq('coach_id', effectiveCoachId)
        .order('date', { ascending: false })
        .limit(1);

      const totalSubmissions = await supabase
        .from('checkins')
        .select('id', { count: 'exact' })
        .eq('coach_id', effectiveCoachId);

      integrations.push({
        id: 'webhook-' + user.id,
        type: 'custom_webhook',
        name: webhookSettings.integration_name || 'Webhook Integration',
        status: 'connected',
        config: {
          webhook_url: webhookUrl,
          primary_identifier: webhookSettings.primary_identifier,
          fallback_identifier: webhookSettings.fallback_identifier,
          auto_create_clients: webhookSettings.auto_create_clients
        },
        created_at: webhookSettings.created_at,
        last_activity: checkinsData?.[0]?.date || webhookSettings.updated_at,
        total_submissions: totalSubmissions.count || 0
      });
    }

    // Fetch GHL and other integrations from user_integrations table
    const { data: userIntegrationsData, error: integrationsError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!integrationsError && userIntegrationsData) {
      for (const integration of userIntegrationsData) {
        // Get submission count for this integration
        let submissionCount = 0;
        if (integration.type === 'ghl') {
          // Count check-ins from GHL forms
          const { data: formSelections } = await supabase
            .from('ghl_form_selections')
            .select('form_id')
            .eq('integration_id', integration.id)
            .eq('is_active', true);

          if (formSelections && formSelections.length > 0) {
            const formIds = formSelections.map(f => f.form_id);
            const { count } = await supabase
              .from('checkins')
              .select('id', { count: 'exact' })
              .eq('coach_id', effectiveCoachId)
              .contains('raw_data', { source: 'ghl' });
            
            submissionCount = count || 0;
          }
        }

        // Get last activity
        const { data: lastCheckin } = await supabase
          .from('checkins')
          .select('date')
          .eq('coach_id', effectiveCoachId)
          .contains('raw_data', { source: integration.type })
          .order('date', { ascending: false })
          .limit(1);

        integrations.push({
          id: integration.id,
          type: integration.type,
          name: integration.name,
          status: integration.status,
          config: integration.config,
          created_at: integration.created_at,
          last_activity: lastCheckin?.[0]?.date || integration.updated_at,
          total_submissions: submissionCount,
        });
      }
    }

    console.log('✅ [getUserIntegrations] Retrieved integrations:', integrations.length);
    return integrations;
  },

  // Delete an integration directly from database
  async deleteIntegration(integrationId: string): Promise<{ success: boolean; error?: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('⚠️ [deleteIntegration] No authenticated user found');
      return { success: false, error: 'User not authenticated' };
    }

    try {
      console.log(`🗑️ [deleteIntegration] Deleting integration ${integrationId} for user ${user.id}`);

      // First, check if integration exists and belongs to user
      const { data: existingIntegration, error: fetchError } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('id', integrationId)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingIntegration) {
        console.log(`❌ [deleteIntegration] Integration not found or access denied:`, fetchError);
        return { success: false, error: 'Integration not found or access denied' };
      }

      console.log(`✅ [deleteIntegration] Found integration:`, existingIntegration.name);

      // Delete related GHL form selections if this is a GHL integration
      if (existingIntegration.type === 'ghl') {
        console.log(`🧹 [deleteIntegration] Cleaning up GHL form selections for integration ${integrationId}`);
        const { error: formSelectionsError } = await supabase
          .from('ghl_form_selections')
          .delete()
          .eq('integration_id', integrationId);

        if (formSelectionsError) {
          console.error('⚠️ [deleteIntegration] Error deleting GHL form selections:', formSelectionsError);
          // Continue with integration deletion even if form selections cleanup fails
        }
      }

      // Delete the integration
      const { error: deleteError } = await supabase
        .from('user_integrations')
        .delete()
        .eq('id', integrationId)
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('❌ [deleteIntegration] Error deleting integration:', deleteError);
        return { success: false, error: 'Failed to delete integration' };
      }

      console.log(`✅ [deleteIntegration] Successfully deleted integration ${integrationId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ [deleteIntegration] Unexpected error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  // Update an integration
  async updateIntegration(integrationId: string, updates: { name?: string; config?: any }): Promise<{ success: boolean; error?: string; integration?: any }> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('⚠️ [updateIntegration] No authenticated user found');
      return { success: false, error: 'User not authenticated' };
    }

    try {
      console.log(`✏️ [updateIntegration] Updating integration ${integrationId} for user ${user.id}`, updates);

      // First, check if integration exists and belongs to user
      const { data: existingIntegration, error: fetchError } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('id', integrationId)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingIntegration) {
        console.log(`❌ [updateIntegration] Integration not found or access denied:`, fetchError);
        return { success: false, error: 'Integration not found or access denied' };
      }

      console.log(`✅ [updateIntegration] Found integration:`, existingIntegration.name);

      // Prepare update data
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.name) {
        updateData.name = updates.name;
      }

      if (updates.config) {
        updateData.config = { ...existingIntegration.config, ...updates.config };
      }

      // Update the integration
      const { data: updatedIntegration, error: updateError } = await supabase
        .from('user_integrations')
        .update(updateData)
        .eq('id', integrationId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ [updateIntegration] Error updating integration:', updateError);
        return { success: false, error: 'Failed to update integration' };
      }

      console.log(`✅ [updateIntegration] Successfully updated integration ${integrationId}`);
      return { success: true, integration: updatedIntegration };

    } catch (error) {
      console.error('❌ [updateIntegration] Unexpected error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

// Checkin webhook settings interface
export interface UserCheckinWebhookSettings {
  id: string;
  user_id: string;
  webhook_secret: string | null;
  integration_name?: string;
  is_active: boolean;
  primary_identifier?: string;
  fallback_identifier?: string;
  auto_create_clients?: boolean;
  new_client_status?: string;
  new_client_engagement?: string;
  created_at: string;
  updated_at: string;
}

// Checkin webhook settings functions
export const checkinWebhookService = {
  // Get current user's checkin webhook settings
  async getUserCheckinWebhookSettings(): Promise<UserCheckinWebhookSettings | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('⚠️ [getUserCheckinWebhookSettings] No authenticated user found');
      return null;
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      console.log('⚠️ [getUserCheckinWebhookSettings] No effective coach ID found');
      return null;
    }

    console.log('🔍 [getUserCheckinWebhookSettings] Fetching webhook settings for effective coach:', effectiveCoachId);
    const { data, error } = await supabase
      .from('user_checkin_webhook_settings')
      .select('*')
      .eq('user_id', effectiveCoachId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching checkin webhook settings:', error);
      return null;
    }

    console.log('📊 [getUserCheckinWebhookSettings] Retrieved settings for coach:', effectiveCoachId, data);
    return data || null;
  },

  // Update or create user's checkin webhook settings
  async updateCheckinWebhookSettings(settings: { 
    webhook_secret: string;
    primary_identifier?: 'phone' | 'email';
    fallback_identifier?: 'phone' | 'email' | 'none';
    auto_create_clients?: boolean;
    new_client_status?: 'active' | 'inactive' | 'paused';
    new_client_engagement?: 'low' | 'medium' | 'high';
  }): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('No authenticated user found');
      return false;
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      console.error('No effective coach ID found');
      return false;
    }

    console.log('🔑 [updateCheckinWebhookSettings] Saving webhook settings for effective coach:', effectiveCoachId);
    const { error } = await supabase
      .from('user_checkin_webhook_settings')
      .upsert({
        user_id: effectiveCoachId,
        webhook_secret: settings.webhook_secret,
        primary_identifier: settings.primary_identifier || 'phone',
        fallback_identifier: settings.fallback_identifier || 'email',
        auto_create_clients: settings.auto_create_clients !== false,
        new_client_status: settings.new_client_status || 'active',
        new_client_engagement: settings.new_client_engagement || 'medium',
        is_active: true
      });

    if (error) {
      console.error('Error updating checkin webhook settings:', error);
      return false;
    }

    console.log('✅ [updateCheckinWebhookSettings] Successfully saved webhook settings for coach:', effectiveCoachId);
    return true;
  },

  // Delete user's checkin webhook settings
  async deleteCheckinWebhookSettings(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('No authenticated user found');
      return false;
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      console.error('No effective coach ID found');
      return false;
    }

    const { error } = await supabase
      .from('user_checkin_webhook_settings')
      .delete()
      .eq('user_id', effectiveCoachId);

    if (error) {
      console.error('Error deleting checkin webhook settings:', error);
      return false;
    }

    return true;
  }
};

// Checkin functions
export const checkinService = {
  // Get pending check-ins for current user
  async getPendingCheckins(clientId?: string): Promise<Checkin[]> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return [];
    }

    let query = supabase
      .from('checkins')
      .select('*')
      .eq('coach_id', effectiveCoachId)
      .eq('status', 'pending_response')
      .order('date', { ascending: false });

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching pending checkins:', error);
      return [];
    }

    return data || [];
  },

  // Get completed check-ins for current user
  async getCompletedCheckins(clientId?: string): Promise<Checkin[]> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return [];
    }

    let query = supabase
      .from('checkins')
      .select('*')
      .eq('coach_id', effectiveCoachId)
      .eq('status', 'responded')
      .order('updated_at', { ascending: false })
      .limit(10); // Show last 10 completed checkins

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching completed checkins:', error);
      return [];
    }

    return data || [];
  },

  // Get count of pending check-ins for current user
  async getPendingCheckinsCount(clientId?: string): Promise<number> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return 0;
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return 0;
    }

    let query = supabase
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', effectiveCoachId)
      .eq('status', 'pending_response');

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    const { count, error } = await query;

    if (error) {
      console.error('Error fetching pending checkins count:', error);
      return 0;
    }

    return count || 0;
  },

  // Get checkin by ID
  async getCheckinById(checkinId: string): Promise<Checkin | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return null;
    }

    const { data, error } = await supabase
      .from('checkins')
      .select('*')
      .eq('id', checkinId)
      .single();

    if (error) {
      console.error('Error fetching checkin:', error);
      return null;
    }

    // Verify the checkin belongs to the effective coach
    if (data && data.coach_id !== effectiveCoachId) {
      console.error('Access denied: checkin does not belong to effective coach');
      return null;
    }

    return data;
  },

  // Create a chat session for a specific checkin
  async createCheckinChatSession(checkinId: string): Promise<ChatSession | null> {
    const checkin = await this.getCheckinById(checkinId);
    if (!checkin) {
      return null;
    }

    const title = `Response to ${checkin.client_name}`;
    const session = await chatService.createChatSession('checkin-ai', undefined, checkinId, 'checkin');
    
    if (session) {
      await chatService.updateChatSession(session.id, { title });
    }

    return session;
  },

  // Update checkin status
  async updateCheckinStatus(checkinId: string, status: Checkin['status'], sessionId?: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return false;
    }

    const updateData: any = { status };
    if (sessionId) {
      updateData.response_session_id = sessionId;
    }

    const { error } = await supabase
      .from('checkins')
      .update(updateData)
      .eq('id', checkinId)
      .eq('coach_id', effectiveCoachId);

    if (error) {
      console.error('Error updating checkin status:', error);
      return false;
    }

    return true;
  },

  // Submit coach response to checkin
  async submitCoachResponse(
    checkinId: string, 
    response: string, 
    responseType: 'written' | 'video'
  ): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return false;
    }

    const { error } = await supabase
      .from('checkins')
      .update({
        coach_response: response,
        response_type: responseType,
        response_submitted_at: new Date().toISOString(),
        status: 'responded'
      })
      .eq('id', checkinId)
      .eq('coach_id', effectiveCoachId);

    if (error) {
      console.error('Error submitting coach response:', error);
      return false;
    }

    return true;
  },

  // Update AI analysis for a checkin
  async updateCheckinAIAnalysis(checkinId: string, analysis: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return false;
    }

    const { error } = await supabase
      .from('checkins')
      .update({
        ai_analysis: analysis,
        ai_analysis_generated_at: new Date().toISOString(),
        ai_analysis_version: 'v1'
      })
      .eq('id', checkinId)
      .eq('coach_id', effectiveCoachId);

    if (error) {
      console.error('Error updating AI analysis:', error);
      return false;
    }

    return true;
  },
};

// Client management functions
export const clientService = {
  // Get all clients for current coach
  async getClients(): Promise<Client[]> {
    console.log('🔍 [clientService] getClients() called');
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('❌ [clientService] No user found');
      return [];
    }

    console.log('🔍 [clientService] User found:', user.id);
    // Get effective coach ID (user's own ID or their coach's ID if they're a team member)
    const effectiveCoachId = await teamService.getEffectiveCoachId();
    console.log('🔍 [clientService] Effective coach ID:', effectiveCoachId);
    if (!effectiveCoachId) {
      console.log('❌ [clientService] No effective coach ID');
      return [];
    }

    console.log('🔍 [clientService] Querying clients table...');
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('coach_id', effectiveCoachId)
      .order('last_checkin_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('❌ [clientService] Error fetching clients:', error);
      return [];
    }

    console.log('✅ [clientService] Successfully fetched clients:', data?.length || 0);
    return data || [];
  },

  // Get active clients only
  async getActiveClients(): Promise<Client[]> {
    const clients = await this.getClients();
    return clients.filter(client => client.status === 'active');
  },

  // Get client by ID
  async getClientById(clientId: string): Promise<Client | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return null;
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('coach_id', effectiveCoachId)
      .single();

    if (error) {
      console.error('Error fetching client:', error);
      return null;
    }

    return data;
  },

  // Create new client
  async createClient(clientData: Omit<Client, 'id' | 'coach_id' | 'created_at' | 'updated_at' | 'total_checkins' | 'last_checkin_at'>): Promise<Client | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return null;
    }

    const { data, error } = await supabase
      .from('clients')
      .insert({
        ...clientData,
        coach_id: effectiveCoachId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating client:', error);
      return null;
    }

    return data;
  },

  // Update client
  async updateClient(clientId: string, updates: Partial<Omit<Client, 'id' | 'coach_id' | 'created_at' | 'updated_at'>>): Promise<Client | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return null;
    }

    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', clientId)
      .eq('coach_id', effectiveCoachId)
      .select()
      .single();

    if (error) {
      console.error('Error updating client:', error);
      return null;
    }

    return data;
  },

  // Delete client
  async deleteClient(clientId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return false;
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId)
      .eq('coach_id', effectiveCoachId);

    if (error) {
      console.error('Error deleting client:', error);
      return false;
    }

    return true;
  },

  // Get client checkin history
  async getClientCheckins(clientId: string, limit: number = 50): Promise<Checkin[]> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) {
      return [];
    }

    const { data, error } = await supabase
      .from('checkins')
      .select('*')
      .eq('coach_id', effectiveCoachId)
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching client checkins:', error);
      return [];
    }

    return data || [];
  },

  // Get client analytics/stats
  async getClientAnalytics(clientId: string): Promise<{
    totalCheckins: number;
    pendingCheckins: number;
    respondedCheckins: number;
    averageResponseTime: number | null;
    lastCheckinDate: string | null;
    engagementTrend: 'improving' | 'stable' | 'declining' | 'unknown';
  }> {
    const checkins = await this.getClientCheckins(clientId, 100); // Get more for analytics
    
    const totalCheckins = checkins.length;
    const pendingCheckins = checkins.filter(c => c.status === 'pending_response').length;
    const respondedCheckins = checkins.filter(c => c.status === 'responded').length;
    const lastCheckinDate = checkins.length > 0 ? checkins[0].date : null;
    
    // Calculate average response time for responded checkins
    const respondedCheckinsWithTimes = checkins
      .filter(c => c.status === 'responded' && c.response_submitted_at)
      .map(c => {
        const checkinDate = new Date(c.created_at);
        const responseDate = new Date(c.response_submitted_at!);
        return responseDate.getTime() - checkinDate.getTime();
      });
    
    const averageResponseTime = respondedCheckinsWithTimes.length > 0 
      ? respondedCheckinsWithTimes.reduce((sum, time) => sum + time, 0) / respondedCheckinsWithTimes.length / (1000 * 60 * 60) // Convert to hours
      : null;
    
    // Simple engagement trend based on checkin frequency in last 30 days vs previous 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    const recentCheckins = checkins.filter(c => new Date(c.date) >= thirtyDaysAgo).length;
    const previousCheckins = checkins.filter(c => {
      const date = new Date(c.date);
      return date >= sixtyDaysAgo && date < thirtyDaysAgo;
    }).length;
    
    let engagementTrend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
    if (recentCheckins > previousCheckins) {
      engagementTrend = 'improving';
    } else if (recentCheckins === previousCheckins) {
      engagementTrend = 'stable';
    } else if (previousCheckins > 0) {
      engagementTrend = 'declining';
    }
    
    return {
      totalCheckins,
      pendingCheckins,
      respondedCheckins,
      averageResponseTime,
      lastCheckinDate,
      engagementTrend
    };
  },

  // Search clients by name
  async searchClients(query: string): Promise<Client[]> {
    const clients = await this.getClients();
    return clients.filter(client => 
      client.full_name.toLowerCase().includes(query.toLowerCase()) ||
      (client.email && client.email.toLowerCase().includes(query.toLowerCase()))
    );
  },

  // Get clients with recent activity
  async getClientsWithRecentActivity(days: number = 7): Promise<Client[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const clients = await this.getClients();
    return clients.filter(client => 
      client.last_checkin_at && new Date(client.last_checkin_at) >= cutoffDate
    );
  },
};

// Batch processing functions for efficiency
export const batchService = {
  // Process multiple checkins for AI analysis in batch
  async batchProcessCheckins(checkinIds: string[]): Promise<{ success: string[], failed: string[] }> {
    const results = { success: [] as string[], failed: [] as string[] };
    
    // Process in batches of 5 to avoid overwhelming the AI service
    const batchSize = 5;
    for (let i = 0; i < checkinIds.length; i += batchSize) {
      const batch = checkinIds.slice(i, i + batchSize);
      
      // Process batch concurrently
      const promises = batch.map(async (checkinId) => {
        try {
          // Get checkin data
          const checkin = await checkinService.getCheckinById(checkinId);
          if (!checkin || !checkin.transcript) {
            return { id: checkinId, success: false };
          }

          // Call AI analysis function with client context
          const { data, error } = await supabase.functions.invoke('openai-checkin-analysis', {
            body: {
              checkinId: checkin.id,
              clientId: checkin.client_id,
              transcript: checkin.transcript,
              clientName: checkin.client_name,
              tags: checkin.tags || [],
              previousAnalysis: checkin.ai_analysis
            }
          });

          if (error) {
            console.error('Error in AI analysis for checkin', checkinId, ':', error);
            return { id: checkinId, success: false };
          }

          // Update the checkin with AI analysis
          await checkinService.updateCheckinAIAnalysis(checkinId, data.analysis);
          return { id: checkinId, success: true };
        } catch (error) {
          console.error('Error processing checkin', checkinId, ':', error);
          return { id: checkinId, success: false };
        }
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(result => {
        if (result.success) {
          results.success.push(result.id);
        } else {
          results.failed.push(result.id);
        }
      });

      // Add small delay between batches to be respectful to the AI service
      if (i + batchSize < checkinIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  },

  // Get all pending checkins that need AI analysis
  async getPendingAnalysisCheckins(): Promise<string[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const effectiveCoachId = await teamService.getEffectiveCoachId();
    if (!effectiveCoachId) return [];

    const { data, error } = await supabase
      .from('checkins')
      .select('id')
      .eq('coach_id', effectiveCoachId)
      .is('ai_analysis', null)
      .not('transcript', 'is', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching pending analysis checkins:', error);
      return [];
    }

    return data.map(checkin => checkin.id);
  },

  // Auto-process pending checkins in background
  async autoProcessPendingCheckins(): Promise<void> {
    const pendingIds = await this.getPendingAnalysisCheckins();
    
    if (pendingIds.length > 0) {
      console.log(`Auto-processing ${pendingIds.length} pending checkins`);
      const results = await this.batchProcessCheckins(pendingIds);
      console.log(`Batch processing complete: ${results.success.length} success, ${results.failed.length} failed`);
      
      // Log the batch processing results
      await logService.logFeatureUsage('batch_ai_processing', {
        total_processed: pendingIds.length,
        successful: results.success.length,
        failed: results.failed.length
      });
    }
  }
};

// AI response templates service
export const responseTemplatesService = {
  // Generate response templates based on checkin analysis
  async generateResponseTemplates(checkinId: string): Promise<{
    encouragement: string;
    guidance: string;
    question: string;
    adjustment: string;
  } | null> {
    try {
      const checkin = await checkinService.getCheckinById(checkinId);
      if (!checkin || !checkin.ai_analysis) {
        return null;
      }

      // Call AI function to generate response templates
      const { data, error } = await supabase.functions.invoke('openai-checkin-chat', {
        body: {
          messages: [{
            role: 'system',
            content: `You are a professional coach helping to generate response templates. Based on the check-in analysis provided, generate 4 different response templates:

1. ENCOURAGEMENT: A positive, supportive message acknowledging progress
2. GUIDANCE: Specific advice or next steps  
3. QUESTION: A thoughtful question to encourage reflection
4. ADJUSTMENT: A suggestion for modifying their approach

Each template should be 2-3 sentences, professional but warm, and personalized to the client's specific situation.

Return your response as a JSON object with keys: encouragement, guidance, question, adjustment`
          }, {
            role: 'user',
            content: `Client: ${checkin.client_name}
            
Check-in Analysis:
${checkin.ai_analysis}

Current Check-in:
${checkin.transcript?.substring(0, 500)}...`
          }],
          clientName: checkin.client_name,
          checkinId: checkin.id
        }
      });

      if (error) {
        console.error('Error generating response templates:', error);
        return null;
      }

      // Try to parse the AI response as JSON
      try {
        const templates = JSON.parse(data.response);
        return templates;
      } catch (parseError) {
        console.error('Error parsing response templates:', parseError);
        // Fallback: create templates from the raw response
        return {
          encouragement: "Great work on staying consistent with your check-ins! I can see you're making thoughtful observations about your progress.",
          guidance: "Based on your recent updates, I recommend focusing on the areas you've identified as needing attention.",
          question: "What do you think has been the biggest factor in your recent progress or challenges?",
          adjustment: "Consider adjusting your approach slightly based on the patterns we're seeing in your check-ins."
        };
      }
    } catch (error) {
      console.error('Error in generateResponseTemplates:', error);
      return null;
    }
  },

  // Get common response templates for quick use
  getQuickResponseTemplates(): Array<{
    id: string;
    title: string;
    content: string;
    category: 'encouragement' | 'guidance' | 'adjustment' | 'question';
  }> {
    return [
      {
        id: 'progress',
        title: 'Great Progress',
        content: "I'm really impressed with the progress you're making! Keep up the excellent work and stay consistent with what's working for you.",
        category: 'encouragement'
      },
      {
        id: 'stay-course',
        title: 'Stay the Course', 
        content: "You're on the right track! Continue with your current approach and let's check in again soon to see how things develop.",
        category: 'guidance'
      },
      {
        id: 'reflect',
        title: 'Reflection Question',
        content: "What do you think has been the most challenging part of this process for you? Understanding this can help us adjust our approach.",
        category: 'question'
      },
      {
        id: 'small-adjustment',
        title: 'Small Adjustment',
        content: "Based on your recent check-ins, let's make a small adjustment to your approach. This should help address the challenges you've mentioned.",
        category: 'adjustment'
      },
      {
        id: 'celebrate-wins',
        title: 'Celebrate Wins',
        content: "Don't forget to celebrate these wins, no matter how small they might seem! Each step forward is meaningful progress.",
        category: 'encouragement'
      },
      {
        id: 'overcome-obstacles',
        title: 'Overcome Obstacles',
        content: "It sounds like you've hit a challenging period. Let's work together to identify strategies that can help you push through this.",
        category: 'guidance'
      },
      {
        id: 'patterns',
        title: 'Notice Patterns',
        content: "I'm noticing some interesting patterns in your check-ins. What patterns are you seeing on your end?",
        category: 'question'
      },
      {
        id: 'modify-approach',
        title: 'Modify Approach',
        content: "Based on your feedback, I think we should modify our approach slightly. This adjustment should better align with your current situation.",
        category: 'adjustment'
      }
    ];
  }
};

// Team member functions
export const teamService = {
  // Get the coach ID for the current user (optimized for single-coach setup)
  async getEffectiveCoachId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    // For now, just return the user's ID (simplified for single-coach setup)
    // This eliminates the slow team_members table query
    return user.id;
  },

  // Check if current user is a team member (optimized for single-coach setup)
  async isTeamMember(): Promise<boolean> {
    // For now, return false (simplified for single-coach setup)
    // This eliminates the team_members table query causing 406 errors
    return false;
  },

  // Get team member role (optimized for single-coach setup)
  async getTeamMemberRole(): Promise<string | null> {
    // For now, return null (simplified for single-coach setup)
    // This eliminates the team_members table query causing 406 errors
    return null;
  }
};

// Debug service for RLS issues
export const debugService = {
  // Run comprehensive RLS debugging
  async debugRLS(): Promise<void> {
    console.log('🔍 [Debug Service] Starting RLS debugging...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Check 1: Authentication status
      console.log('\n📋 CHECK 1: Authentication Status');
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        console.error('❌ Error getting user:', userError);
        return;
      }

      if (!user) {
        console.warn('⚠️ No authenticated user found');
        return;
      }

      console.log('✅ User authenticated:', {
        id: user.id,
        email: user.email,
        role: user.role,
      });

      // Check 2: Session status
      console.log('\n📋 CHECK 2: Session Status');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ Error getting session:', sessionError);
      } else if (session) {
        console.log('✅ Session active:', {
          expiresAt: new Date(session.expires_at! * 1000).toISOString(),
          hasAccessToken: !!session.access_token,
        });
      } else {
        console.warn('⚠️ No active session');
      }

      // Check 3: Query user profile
      console.log('\n📋 CHECK 3: Query User Profile');
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('❌ Error querying profile:', {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
        });

        if (profileError.code === 'PGRST301') {
          console.error('\n🚨 RLS POLICY VIOLATION DETECTED!');
          console.error('This means the RLS policies are blocking your access.');
          console.error('Expected policy: "Users can view own profile" with condition: auth.uid() = id');
        }
      } else if (profile) {
        console.log('✅ Profile retrieved:', {
          id: profile.id,
          email: profile.email,
          app_role: profile.app_role,
        });
      } else {
        console.warn('⚠️ No profile found for user');
      }

      // Check 4: Call debug edge function
      console.log('\n📋 CHECK 4: Server-Side RLS Debug');
      try {
        const { data: debugData, error: debugError } = await supabase.functions.invoke('debug-rls');

        if (debugError) {
          console.error('❌ Error calling debug function:', debugError);
        } else {
          console.log('✅ Debug function results:', debugData);
        }
      } catch (err) {
        console.error('❌ Failed to call debug function:', err);
      }

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 [Debug Service] RLS debugging complete');
      console.log('\n💡 TIPS:');
      console.log('  - All queries use .maybeSingle() to avoid 406 errors');
      console.log('  - Check the database RLS policies in Supabase dashboard');
      console.log('  - Verify auth.uid() equals your user ID in policies');
      console.log('  - Ensure all policies use "authenticated" role');
      console.log('  - Check for typos in policy conditions');
      console.log('\n📚 For detailed guide, see: DEBUG_RLS.md');
    } catch (error) {
      console.error('❌ Fatal error during debugging:', error);
    }
  },

  // Quick check if RLS is working
  async quickCheck(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('❌ Not authenticated');
      return false;
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('❌ RLS Check Failed:', error.code, error.message);
      return false;
    }

    if (data) {
      console.log('✅ RLS is working - can read own profile');
      return true;
    }

    console.warn('⚠️ No profile found');
    return false;
  }
};

// Application logging service
export const logService = {
  // Log an application event
  async logEvent(
    eventType: string,
    eventDetails: Record<string, any> = {},
    context: string = 'frontend'
  ): Promise<boolean> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        return false;
      }

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${supabaseUrl}/functions/v1/log-app-event`, {
        method: 'POST',
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: eventType,
          event_details: eventDetails,
          context: context
        }),
      });

      if (!response.ok) {
        return false;
      }

      return true;
    } catch (error) {
      // Silently fail - logging is optional and should not break the app
      // CORS errors from log-app-event function are expected if it doesn't exist
      return false;
    }
  },

  // Log an error with stack trace
  async logError(error: Error, context: string = 'frontend', additionalDetails: Record<string, any> = {}): Promise<boolean> {
    return this.logEvent('error', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      ...additionalDetails
    }, context);
  },

  // Log feature usage
  async logFeatureUsage(feature: string, details: Record<string, any> = {}): Promise<boolean> {
    return this.logEvent('feature_usage', {
      feature,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      ...details
    }, 'frontend');
  }
};