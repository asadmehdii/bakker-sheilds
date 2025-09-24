-- CHECKINAI DATA MIGRATION SCRIPT
-- This script safely migrates existing checkin data to the new client-centric schema
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- STEP 1: Create clients table
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
    UNIQUE(coach_id, full_name) -- Prevent duplicate client names for same coach
);

-- Create unique constraint for email (with WHERE clause)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_email 
ON public.clients(coach_id, email) 
WHERE email IS NOT NULL;

-- Create indexes for efficient queries
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

-- ============================================================================
-- STEP 2: Migrate existing checkin data
-- ============================================================================

-- Migration function to safely convert existing data
CREATE OR REPLACE FUNCTION migrate_checkin_clients()
RETURNS void AS $$
DECLARE
    checkin_record RECORD;
    client_uuid UUID;
    migration_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting checkin data migration...';
    
    -- First, clean up empty string client_ids to NULL for easier handling
    UPDATE checkins SET client_id = NULL WHERE client_id = '';
    
    -- Loop through all checkins that have client_name but no proper client_id
    FOR checkin_record IN 
        SELECT DISTINCT coach_id, client_name 
        FROM checkins 
        WHERE client_name IS NOT NULL 
        AND client_name != ''
        AND client_id IS NULL
    LOOP
        -- Try to find existing client
        SELECT id INTO client_uuid
        FROM clients
        WHERE coach_id = checkin_record.coach_id
        AND full_name = checkin_record.client_name
        LIMIT 1;
        
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
            
            RAISE NOTICE 'Created client: "%" for coach: %', checkin_record.client_name, checkin_record.coach_id;
        END IF;
        
        -- Update all checkins for this coach/client combination
        UPDATE checkins 
        SET client_id = client_uuid::text
        WHERE coach_id = checkin_record.coach_id
        AND client_name = checkin_record.client_name
        AND client_id IS NULL;
        
        migration_count := migration_count + 1;
        RAISE NOTICE 'Updated checkins for client: "%" (% clients migrated)', checkin_record.client_name, migration_count;
    END LOOP;
    
    RAISE NOTICE 'Migration complete! Migrated % unique clients', migration_count;
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT migrate_checkin_clients();

-- Clean up migration function
DROP FUNCTION migrate_checkin_clients();

-- Handle any remaining NULL client_ids by creating "Unknown Client" records
DO $$
DECLARE
    coach_record RECORD;
    default_client_uuid UUID;
    unknown_count INTEGER := 0;
BEGIN
    -- For each coach that has checkins without client_id, create an "Unknown Client"
    FOR coach_record IN 
        SELECT DISTINCT coach_id 
        FROM checkins 
        WHERE client_id IS NULL OR client_id = ''
    LOOP
        -- Create the "Unknown Client" for this coach
        INSERT INTO clients (coach_id, full_name, status, engagement_level, tags)
        VALUES (coach_record.coach_id, 'Unknown Client', 'inactive', 'low', ARRAY['migrated', 'unknown'])
        ON CONFLICT (coach_id, full_name) DO NOTHING
        RETURNING id INTO default_client_uuid;
        
        -- If no UUID returned (conflict), get the existing one
        IF default_client_uuid IS NULL THEN
            SELECT id INTO default_client_uuid
            FROM clients
            WHERE coach_id = coach_record.coach_id
            AND full_name = 'Unknown Client'
            LIMIT 1;
        END IF;
        
        -- Update checkins with null client_id
        UPDATE checkins 
        SET client_id = default_client_uuid::text
        WHERE coach_id = coach_record.coach_id
        AND client_id IS NULL;
        
        unknown_count := unknown_count + 1;
    END LOOP;
    
    IF unknown_count > 0 THEN
        RAISE NOTICE 'Created % "Unknown Client" records for checkins without proper client names', unknown_count;
    END IF;
END $$;

-- Add proper foreign key constraint and make client_id required
ALTER TABLE checkins 
ALTER COLUMN client_id TYPE UUID USING client_id::UUID,
ALTER COLUMN client_id SET NOT NULL;

ALTER TABLE checkins 
ADD CONSTRAINT fk_checkins_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_checkins_client_id ON checkins(client_id);
CREATE INDEX IF NOT EXISTS idx_checkins_client_date ON checkins(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_client_status ON checkins(client_id, status);

-- ============================================================================
-- STEP 3: Update client statistics with current data
-- ============================================================================

-- Create trigger to maintain client stats
CREATE OR REPLACE FUNCTION update_client_checkin_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        UPDATE clients 
        SET 
            total_checkins = (
                SELECT COUNT(*) 
                FROM checkins 
                WHERE client_id = NEW.client_id
            ),
            last_checkin_at = GREATEST(
                COALESCE(last_checkin_at, '1970-01-01'::timestamptz),
                NEW.created_at
            ),
            updated_at = NOW()
        WHERE id = NEW.client_id;
        
        RETURN NEW;
    END IF;
    
    -- Handle UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- Update stats for both old and new clients if client changed
        IF OLD.client_id != NEW.client_id THEN
            -- Update old client stats
            UPDATE clients 
            SET 
                total_checkins = (
                    SELECT COUNT(*) 
                    FROM checkins 
                    WHERE client_id = OLD.client_id
                ),
                last_checkin_at = (
                    SELECT MAX(created_at) 
                    FROM checkins 
                    WHERE client_id = OLD.client_id
                ),
                updated_at = NOW()
            WHERE id = OLD.client_id;
        END IF;
        
        -- Update new client stats
        UPDATE clients 
        SET 
            total_checkins = (
                SELECT COUNT(*) 
                FROM checkins 
                WHERE client_id = NEW.client_id
            ),
            last_checkin_at = (
                SELECT MAX(created_at) 
                FROM checkins 
                WHERE client_id = NEW.client_id
            ),
            updated_at = NOW()
        WHERE id = NEW.client_id;
        
        RETURN NEW;
    END IF;
    
    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        UPDATE clients 
        SET 
            total_checkins = (
                SELECT COUNT(*) 
                FROM checkins 
                WHERE client_id = OLD.client_id
            ),
            last_checkin_at = (
                SELECT MAX(created_at) 
                FROM checkins 
                WHERE client_id = OLD.client_id
            ),
            updated_at = NOW()
        WHERE id = OLD.client_id;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_client_checkin_stats
    AFTER INSERT OR UPDATE OR DELETE ON checkins
    FOR EACH ROW
    EXECUTE FUNCTION update_client_checkin_stats();

-- Update all existing client stats
UPDATE clients 
SET 
    total_checkins = (
        SELECT COUNT(*) 
        FROM checkins 
        WHERE client_id = clients.id
    ),
    last_checkin_at = (
        SELECT MAX(created_at) 
        FROM checkins 
        WHERE client_id = clients.id
    ),
    updated_at = NOW();

-- ============================================================================
-- STEP 4: Add webhook client matching settings
-- ============================================================================

-- Add client matching configuration to webhook settings
ALTER TABLE user_checkin_webhook_settings 
ADD COLUMN IF NOT EXISTS primary_identifier TEXT DEFAULT 'phone' CHECK (primary_identifier IN ('phone', 'email')),
ADD COLUMN IF NOT EXISTS fallback_identifier TEXT DEFAULT 'email' CHECK (fallback_identifier IN ('phone', 'email', 'none')),
ADD COLUMN IF NOT EXISTS auto_create_clients BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS new_client_status TEXT DEFAULT 'active' CHECK (new_client_status IN ('active', 'inactive', 'paused')),
ADD COLUMN IF NOT EXISTS new_client_engagement TEXT DEFAULT 'medium' CHECK (new_client_engagement IN ('low', 'medium', 'high'));

-- Add constraint to ensure primary and fallback are different (unless fallback is 'none')
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE user_checkin_webhook_settings 
        ADD CONSTRAINT check_different_identifiers 
        CHECK (fallback_identifier = 'none' OR primary_identifier != fallback_identifier);
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'Constraint check_different_identifiers already exists';
    END;
END $$;

-- Update existing webhook settings with default values
UPDATE user_checkin_webhook_settings 
SET 
    primary_identifier = 'phone',
    fallback_identifier = 'email', 
    auto_create_clients = true,
    new_client_status = 'active',
    new_client_engagement = 'medium'
WHERE primary_identifier IS NULL;

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================

-- Display migration summary
DO $$
DECLARE
    client_count INTEGER;
    checkin_count INTEGER;
    webhook_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO client_count FROM clients;
    SELECT COUNT(*) INTO checkin_count FROM checkins WHERE client_id IS NOT NULL;
    SELECT COUNT(*) INTO webhook_count FROM user_checkin_webhook_settings;
    
    RAISE NOTICE '';
    RAISE NOTICE '🎉 MIGRATION COMPLETE! 🎉';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Migration Summary:';
    RAISE NOTICE '   • Clients created: %', client_count;
    RAISE NOTICE '   • Checkins linked: %', checkin_count;
    RAISE NOTICE '   • Webhook configs: %', webhook_count;
    RAISE NOTICE '';
    RAISE NOTICE '✅ All existing data has been preserved and migrated to the new client-centric schema!';
    RAISE NOTICE '✅ CheckinAI is now ready to use with enhanced client management features!';
    RAISE NOTICE '';
END $$;