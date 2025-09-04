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

export interface Checkin {
  id: string;
  coach_id: string;
  client_id: string | null;
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
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('🔍 [User Service] No user found when getting profile');
      return null;
    }

    console.log('🔍 [User Service] Getting profile for user:', user.id, user.email);

    // First check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        console.log('⚠️ [User Service] No profile found, creating one...');
        // Create profile if it doesn't exist
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.email || '',
            app_role: 'user' // Default role
          })
          .select()
          .single();

        if (createError) {
          console.error('❌ [User Service] Error creating user profile:', createError);
          return null;
        }

        console.log('✅ [User Service] Created new user profile:', newProfile);
        return newProfile;
      } else {
        console.error('❌ [User Service] Error checking user profile:', checkError);
        return null;
      }
    }

    console.log('✅ [User Service] Retrieved existing user profile:', existingProfile);
    return existingProfile;
  }
};

// Checkin webhook settings interface
export interface UserCheckinWebhookSettings {
  id: string;
  user_id: string;
  webhook_secret: string | null;
  is_active: boolean;
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

// Team member functions
export const teamService = {
  // Get the coach ID for the current user (returns user ID if they are a coach, or their coach's ID if they are a team member)
  async getEffectiveCoachId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    // Use .maybeSingle() to handle no rows without error
    const { data: teamMember, error } = await supabase
      .from('team_members')
      .select('coach_id')
      .eq('member_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ [Team Service] Error fetching team member:', error);
      return user.id; // Fallback to user's own ID
    }

    // Return coach ID if user is a team member, otherwise return user's own ID
    return teamMember?.coach_id || user.id;
  },

  // Check if current user is a team member (not the coach)
  async isTeamMember(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    const { data: teamMember, error } = await supabase
      .from('team_members')
      .select('id')
      .eq('member_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking team member status:', error);
      return false;
    }
    return !!teamMember;
  },

  // Get team member role
  async getTeamMemberRole(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const { data: teamMember, error } = await supabase
      .from('team_members')
      .select('role')
      .eq('member_id', user.id)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching team member role:', error);
      return null;
    }

    return teamMember?.role || null;
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
        console.warn('Supabase configuration missing for logging');
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
        console.warn('Failed to log event:', eventType, response.status);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Error logging event:', error);
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