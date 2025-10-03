-- Update checkins table to properly reference clients table
-- and migrate existing data

-- First, let's make client_id NOT NULL and add proper foreign key
-- But we need to migrate existing data first

-- Step 1: Create a function to find or create clients based on existing checkin data
CREATE OR REPLACE FUNCTION migrate_checkin_clients()
RETURNS void AS $$
DECLARE
    checkin_record RECORD;
    client_uuid UUID;
BEGIN
    -- Loop through all checkins that have client_name but no client_id
    FOR checkin_record IN 
        SELECT DISTINCT coach_id, client_name 
        FROM checkins 
        WHERE client_name IS NOT NULL 
        AND client_name != ''
        AND (client_id IS NULL OR client_id = '')
    LOOP
        -- Try to find existing client
        SELECT id INTO client_uuid
        FROM clients
        WHERE coach_id = checkin_record.coach_id
        AND full_name = checkin_record.client_name
        LIMIT 1;
        
        -- If client doesn't exist, create one
        IF client_uuid IS NULL THEN
            INSERT INTO clients (coach_id, full_name)
            VALUES (checkin_record.coach_id, checkin_record.client_name)
            RETURNING id INTO client_uuid;
            
            RAISE NOTICE 'Created client: % for coach: %', checkin_record.client_name, checkin_record.coach_id;
        END IF;
        
        -- Update all checkins for this coach/client combination
        UPDATE checkins 
        SET client_id = client_uuid::text
        WHERE coach_id = checkin_record.coach_id
        AND client_name = checkin_record.client_name
        AND (client_id IS NULL OR client_id = '');
        
        RAISE NOTICE 'Updated checkins for client: %', checkin_record.client_name;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT migrate_checkin_clients();

-- Drop the migration function as it's no longer needed
DROP FUNCTION migrate_checkin_clients();

-- Step 2: Now that we have client_ids, let's add proper constraints
-- First, let's handle any remaining NULL client_ids by setting a default client
DO $$
DECLARE
    coach_record RECORD;
    default_client_uuid UUID;
BEGIN
    -- For each coach that has checkins without client_id, create an "Unknown Client"
    FOR coach_record IN 
        SELECT DISTINCT coach_id 
        FROM checkins 
        WHERE client_id IS NULL OR client_id = ''
    LOOP
        -- Create or find the "Unknown Client" for this coach
        INSERT INTO clients (coach_id, full_name, status)
        VALUES (coach_record.coach_id, 'Unknown Client', 'inactive')
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
        AND (client_id IS NULL OR client_id = '');
    END LOOP;
END $$;

-- Step 3: Add proper foreign key constraint
-- Convert client_id to UUID type and add foreign key
ALTER TABLE checkins 
ALTER COLUMN client_id TYPE UUID USING client_id::UUID,
ALTER COLUMN client_id SET NOT NULL;

ALTER TABLE checkins 
ADD CONSTRAINT fk_checkins_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- Step 4: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_checkins_client_id ON checkins(client_id);
CREATE INDEX IF NOT EXISTS idx_checkins_client_date ON checkins(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_client_status ON checkins(client_id, status);

-- Step 5: Create a trigger to update client stats when checkins change
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

-- Step 6: Update existing client stats with current checkin data
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