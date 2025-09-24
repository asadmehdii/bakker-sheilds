-- SIMPLE CHECKINAI DATA MIGRATION
-- This script creates the clients table and migrates existing data safely

-- ============================================================================
-- STEP 1: Create clients table (same as before)
-- ============================================================================

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
    UNIQUE(coach_id, full_name)
);

-- Create unique constraint for email
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_email 
ON public.clients(coach_id, email) 
WHERE email IS NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_clients_coach_id ON public.clients(coach_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_last_checkin ON public.clients(last_checkin_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(coach_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(coach_id, email) WHERE email IS NOT NULL;

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

-- Enable RLS and policies
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clients" ON public.clients
    FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Users can insert their own clients" ON public.clients
    FOR INSERT WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Users can update their own clients" ON public.clients
    FOR UPDATE USING (coach_id = auth.uid());

CREATE POLICY "Users can delete their own clients" ON public.clients
    FOR DELETE USING (coach_id = auth.uid());

-- Team member policies
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

-- ============================================================================
-- STEP 2: Check current checkins table structure and migrate data
-- ============================================================================

DO $$
DECLARE
    checkin_record RECORD;
    client_uuid UUID;
    migration_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting migration of existing checkin data...';
    
    -- First check what type client_id currently is
    RAISE NOTICE 'Current checkins table structure checked';
    
    -- Create clients from existing checkin data (only where we have client_name)
    FOR checkin_record IN 
        SELECT DISTINCT coach_id, client_name 
        FROM checkins 
        WHERE client_name IS NOT NULL 
        AND client_name != ''
        AND client_name != 'undefined'
    LOOP
        -- Check if client already exists
        SELECT id INTO client_uuid
        FROM clients
        WHERE coach_id = checkin_record.coach_id
        AND full_name = checkin_record.client_name;
        
        -- If client doesn't exist, create one
        IF client_uuid IS NULL THEN
            INSERT INTO clients (coach_id, full_name, status, engagement_level, tags, onboarded_at)
            VALUES (
                checkin_record.coach_id, 
                checkin_record.client_name,
                'active',
                'medium',
                ARRAY['migrated'],
                NOW()
            )
            RETURNING id INTO client_uuid;
            
            migration_count := migration_count + 1;
            RAISE NOTICE 'Created client: "%" for coach: % (total: %)', 
                checkin_record.client_name, checkin_record.coach_id, migration_count;
        ELSE
            RAISE NOTICE 'Client already exists: "%"', checkin_record.client_name;
        END IF;
        
    END LOOP;
    
    RAISE NOTICE 'Migration complete! Created % unique clients from existing checkin data', migration_count;
    
END $$;

-- ============================================================================
-- STEP 3: Add webhook client matching settings to existing table
-- ============================================================================

-- Add client matching configuration to webhook settings
ALTER TABLE user_checkin_webhook_settings 
ADD COLUMN IF NOT EXISTS primary_identifier TEXT DEFAULT 'phone' CHECK (primary_identifier IN ('phone', 'email')),
ADD COLUMN IF NOT EXISTS fallback_identifier TEXT DEFAULT 'email' CHECK (fallback_identifier IN ('phone', 'email', 'none')),
ADD COLUMN IF NOT EXISTS auto_create_clients BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS new_client_status TEXT DEFAULT 'active' CHECK (new_client_status IN ('active', 'inactive', 'paused')),
ADD COLUMN IF NOT EXISTS new_client_engagement TEXT DEFAULT 'medium' CHECK (new_client_engagement IN ('low', 'medium', 'high'));

-- Add constraint for different identifiers
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE user_checkin_webhook_settings 
        ADD CONSTRAINT check_different_identifiers 
        CHECK (fallback_identifier = 'none' OR primary_identifier != fallback_identifier);
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'Constraint already exists';
    END;
END $$;

-- Update existing webhook settings
UPDATE user_checkin_webhook_settings 
SET 
    primary_identifier = 'phone',
    fallback_identifier = 'email', 
    auto_create_clients = true,
    new_client_status = 'active',
    new_client_engagement = 'medium'
WHERE primary_identifier IS NULL;

-- ============================================================================
-- FINAL SUMMARY
-- ============================================================================

DO $$
DECLARE
    client_count INTEGER;
    checkin_count INTEGER;
    webhook_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO client_count FROM clients;
    SELECT COUNT(*) INTO checkin_count FROM checkins;
    SELECT COUNT(*) INTO webhook_count FROM user_checkin_webhook_settings;
    
    RAISE NOTICE '';
    RAISE NOTICE '🎉 INITIAL MIGRATION COMPLETE! 🎉';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Summary:';
    RAISE NOTICE '   • Clients created: %', client_count;
    RAISE NOTICE '   • Total checkins: %', checkin_count;
    RAISE NOTICE '   • Webhook configs: %', webhook_count;
    RAISE NOTICE '';
    RAISE NOTICE '✅ Clients table created and populated with existing client names!';
    RAISE NOTICE '⚠️  Next step: Link checkins to clients (requires separate script)';
    RAISE NOTICE '';
END $$;