/*
  # Create Base Application Tables

  1. New Tables
    - `user_profiles` - User profile information
    - `chat_sessions` - Chat session tracking
    - `messages` - Chat messages
    - `checkins` - Client check-in submissions
    - `user_checkin_webhook_settings` - Webhook configuration
    
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated user access
*/

-- User profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium', 'enterprise')),
    subscription_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    niche_analysis TEXT,
    niche_analysis_generated_at TIMESTAMPTZ,
    has_completed_niche_onboarding BOOLEAN DEFAULT FALSE,
    app_role TEXT DEFAULT 'coach' CHECK (app_role IN ('user', 'coach', 'admin', 'super_admin'))
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Chat sessions table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id TEXT,
    title TEXT NOT NULL,
    last_message_preview TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    ai_type TEXT NOT NULL,
    checkin_id UUID,
    type TEXT DEFAULT 'general' CHECK (type IN ('general', 'checkin')),
    embedding FLOAT[],
    content_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_ai_type ON public.chat_sessions(ai_type);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat sessions" ON public.chat_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat sessions" ON public.chat_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat sessions" ON public.chat_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages" ON public.messages
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages" ON public.messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Checkins table
CREATE TABLE IF NOT EXISTS public.checkins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID,
    client_name TEXT NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    transcript TEXT,
    embedding FLOAT[],
    tags TEXT[] DEFAULT '{}',
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'pending_response' CHECK (status IN ('pending_response', 'responded', 'archived')),
    response_session_id UUID REFERENCES public.chat_sessions(id),
    coach_response TEXT,
    response_type TEXT CHECK (response_type IN ('written', 'video')),
    response_submitted_at TIMESTAMPTZ,
    ai_analysis TEXT,
    ai_analysis_generated_at TIMESTAMPTZ,
    ai_analysis_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkins_coach_id ON public.checkins(coach_id);
CREATE INDEX IF NOT EXISTS idx_checkins_client_id ON public.checkins(client_id);
CREATE INDEX IF NOT EXISTS idx_checkins_status ON public.checkins(status);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON public.checkins(date DESC);

ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own checkins" ON public.checkins
    FOR SELECT USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can insert own checkins" ON public.checkins
    FOR INSERT WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can update own checkins" ON public.checkins
    FOR UPDATE USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can delete own checkins" ON public.checkins
    FOR DELETE USING (auth.uid() = coach_id);

-- User checkin webhook settings table
CREATE TABLE IF NOT EXISTS public.user_checkin_webhook_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    webhook_secret TEXT,
    integration_name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    primary_identifier TEXT DEFAULT 'phone' CHECK (primary_identifier IN ('phone', 'email')),
    fallback_identifier TEXT DEFAULT 'email' CHECK (fallback_identifier IN ('phone', 'email', 'none')),
    auto_create_clients BOOLEAN DEFAULT TRUE,
    new_client_status TEXT DEFAULT 'active' CHECK (new_client_status IN ('active', 'inactive', 'paused')),
    new_client_engagement TEXT DEFAULT 'medium' CHECK (new_client_engagement IN ('low', 'medium', 'high')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

ALTER TABLE public.user_checkin_webhook_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own webhook settings" ON public.user_checkin_webhook_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own webhook settings" ON public.user_checkin_webhook_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own webhook settings" ON public.user_checkin_webhook_settings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own webhook settings" ON public.user_checkin_webhook_settings
    FOR DELETE USING (auth.uid() = user_id);
