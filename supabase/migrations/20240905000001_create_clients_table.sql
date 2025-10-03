-- Create clients table for proper client management
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Basic client information
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    
    -- Client demographics and goals
    age INTEGER,
    gender TEXT,
    location TEXT,
    goals TEXT,
    notes TEXT,
    
    -- Client status and engagement
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'paused')),
    engagement_level TEXT DEFAULT 'medium' CHECK (engagement_level IN ('low', 'medium', 'high')),
    
    -- Client onboarding and progress
    onboarded_at TIMESTAMPTZ,
    last_checkin_at TIMESTAMPTZ,
    total_checkins INTEGER DEFAULT 0,
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(coach_id, full_name), -- Prevent duplicate client names for same coach
    UNIQUE(coach_id, email) WHERE email IS NOT NULL -- Prevent duplicate emails for same coach
);

-- Create index for efficient coach queries
CREATE INDEX IF NOT EXISTS idx_clients_coach_id ON public.clients(coach_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_last_checkin ON public.clients(last_checkin_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_clients_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION update_clients_updated_at();

-- Enable Row Level Security
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own clients" ON public.clients
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Users can insert their own clients" ON public.clients
    FOR INSERT WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Users can update their own clients" ON public.clients
    FOR UPDATE USING (coach_id = auth.uid());

CREATE POLICY "Users can delete their own clients" ON public.clients
    FOR DELETE USING (coach_id = auth.uid());

-- Allow team members to access their coach's clients
CREATE POLICY "Team members can view coach's clients" ON public.clients
    FOR SELECT USING (
        coach_id IN (
            SELECT tm.coach_id 
            FROM team_members tm 
            WHERE tm.member_id = auth.uid() 
            AND tm.status = 'active'
        )
    );

CREATE POLICY "Team members can update coach's clients" ON public.clients
    FOR UPDATE USING (
        coach_id IN (
            SELECT tm.coach_id 
            FROM team_members tm 
            WHERE tm.member_id = auth.uid() 
            AND tm.status = 'active'
        )
    );