-- SAFE MIGRATION OPTION D: Column Rename Approach (FIXED)
-- This preserves ALL existing data by renaming the problematic column
-- and creating a new properly structured one

-- ============================================================================
-- STEP 1: Create clients table first
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

-- Enable RLS and basic policies (no team member policies yet)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clients" ON public.clients
    FOR SELECT USING (coach_id = auth.uid());
CREATE POLICY "Users can insert their own clients" ON public.clients
    FOR INSERT WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Users can update their own clients" ON public.clients
    FOR UPDATE USING (coach_id = auth.uid());
CREATE POLICY "Users can delete their own clients" ON public.clients
    FOR DELETE USING (coach_id = auth.uid());

-- ============================================================================
-- STEP 2: SAFELY rename the problematic client_id column
-- ============================================================================

-- Rename the existing client_id column to preserve all data
ALTER TABLE checkins RENAME COLUMN client_id TO old_client_id;

-- Add a new properly structured client_id column
ALTER TABLE checkins ADD COLUMN client_id UUID;

-- ============================================================================
-- STEP 3: Create client records from existing checkin data
-- ============================================================================

DO $$
DECLARE
    checkin_record RECORD;
    client_uuid UUID;
    migration_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Creating client records from existing checkin data...';
    
    -- Create clients from existing checkin data
    FOR checkin_record IN 
        SELECT DISTINCT coach_id, client_name 
        FROM checkins 
        WHERE client_name IS NOT NULL 
        AND client_name != ''
        AND client_name != 'undefined'
        AND client_name != 'null'
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
            RAISE NOTICE 'Created client: "%" (total: %)', 
                checkin_record.client_name, migration_count;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Client creation complete! Created % unique clients', migration_count;
END $$;

-- ============================================================================
-- STEP 4: Link checkins to the new client records
-- ============================================================================

DO $$
DECLARE
    update_count INTEGER := 0;
    unknown_count INTEGER := 0;
    coach_record RECORD;
    default_client_uuid UUID;
BEGIN
    RAISE NOTICE 'Linking checkins to client records...';
    
    -- Update checkins with proper client_id based on client_name
    UPDATE checkins 
    SET client_id = clients.id
    FROM clients
    WHERE checkins.coach_id = clients.coach_id
    AND checkins.client_name = clients.full_name
    AND checkins.client_name IS NOT NULL
    AND checkins.client_name != ''
    AND checkins.client_name != 'undefined'
    AND checkins.client_name != 'null';
    
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Linked % checkins to existing clients', update_count;
    
    -- Handle checkins without valid client_name by creating "Unknown Client" for each coach
    FOR coach_record IN 
        SELECT DISTINCT coach_id 
        FROM checkins 
        WHERE client_id IS NULL
    LOOP
        -- Create or find "Unknown Client" for this coach
        INSERT INTO clients (coach_id, full_name, status, engagement_level, tags)
        VALUES (coach_record.coach_id, 'Unknown Client', 'inactive', 'low', ARRAY['migrated', 'unknown'])
        ON CONFLICT (coach_id, full_name) DO NOTHING
        RETURNING id INTO default_client_uuid;
        
        -- If no UUID returned (conflict), get the existing one
        IF default_client_uuid IS NULL THEN
            SELECT id INTO default_client_uuid
            FROM clients
            WHERE coach_id = coach_record.coach_id
            AND full_name = 'Unknown Client';
        END IF;
        
        -- Update checkins with null client_id
        UPDATE checkins 
        SET client_id = default_client_uuid
        WHERE coach_id = coach_record.coach_id
        AND client_id IS NULL;
        
        unknown_count := unknown_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Created % "Unknown Client" records for unmatched checkins', unknown_count;
END $$;

-- ============================================================================
-- STEP 5: Add constraints and indexes to new client_id column
-- ============================================================================

-- Make client_id NOT NULL now that all records are linked
ALTER TABLE checkins ALTER COLUMN client_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE checkins 
ADD CONSTRAINT fk_checkins_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_checkins_client_id ON checkins(client_id);
CREATE INDEX IF NOT EXISTS idx_checkins_client_date ON checkins(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_client_status ON checkins(client_id, status);

-- ============================================================================
-- STEP 6: Create triggers for maintaining client statistics
-- ============================================================================

CREATE OR REPLACE FUNCTION update_client_checkin_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE clients 
        SET 
            total_checkins = (SELECT COUNT(*) FROM checkins WHERE client_id = NEW.client_id),
            last_checkin_at = GREATEST(COALESCE(last_checkin_at, '1970-01-01'::timestamptz), NEW.created_at),
            updated_at = NOW()
        WHERE id = NEW.client_id;
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'UPDATE' THEN
        IF OLD.client_id != NEW.client_id THEN
            -- Update old client stats
            UPDATE clients 
            SET 
                total_checkins = (SELECT COUNT(*) FROM checkins WHERE client_id = OLD.client_id),
                last_checkin_at = (SELECT MAX(created_at) FROM checkins WHERE client_id = OLD.client_id),
                updated_at = NOW()
            WHERE id = OLD.client_id;
        END IF;
        
        -- Update new client stats
        UPDATE clients 
        SET 
            total_checkins = (SELECT COUNT(*) FROM checkins WHERE client_id = NEW.client_id),
            last_checkin_at = (SELECT MAX(created_at) FROM checkins WHERE client_id = NEW.client_id),
            updated_at = NOW()
        WHERE id = NEW.client_id;
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        UPDATE clients 
        SET 
            total_checkins = (SELECT COUNT(*) FROM checkins WHERE client_id = OLD.client_id),
            last_checkin_at = (SELECT MAX(created_at) FROM checkins WHERE client_id = OLD.client_id),
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
    total_checkins = (SELECT COUNT(*) FROM checkins WHERE client_id = clients.id),
    last_checkin_at = (SELECT MAX(created_at) FROM checkins WHERE client_id = clients.id),
    updated_at = NOW();

-- ============================================================================
-- STEP 7: Add webhook client matching settings
-- ============================================================================

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
-- MIGRATION COMPLETE - SUMMARY
-- ============================================================================

DO $$
DECLARE
    client_count INTEGER;
    checkin_count INTEGER;
    linked_count INTEGER;
    webhook_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO client_count FROM clients;
    SELECT COUNT(*) INTO checkin_count FROM checkins;
    SELECT COUNT(*) INTO linked_count FROM checkins WHERE client_id IS NOT NULL;
    SELECT COUNT(*) INTO webhook_count FROM user_checkin_webhook_settings;
    
    RAISE NOTICE '';
    RAISE NOTICE '🎉 SAFE MIGRATION COMPLETE! 🎉';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Migration Summary:';
    RAISE NOTICE '   • Clients created: %', client_count;
    RAISE NOTICE '   • Total checkins: %', checkin_count;
    RAISE NOTICE '   • Checkins linked: %', linked_count;
    RAISE NOTICE '   • Webhook configs: %', webhook_count;
    RAISE NOTICE '';
    RAISE NOTICE '✅ All existing data preserved and migrated!';
    RAISE NOTICE '✅ Old client_id data still available in old_client_id column';
    RAISE NOTICE '✅ Ready to test the application!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 To cleanup later (OPTIONAL):';
    RAISE NOTICE '   ALTER TABLE checkins DROP COLUMN old_client_id;';
    RAISE NOTICE '';
END $$;