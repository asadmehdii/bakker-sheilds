-- Add client matching configuration to webhook settings
ALTER TABLE user_checkin_webhook_settings 
ADD COLUMN primary_identifier TEXT DEFAULT 'phone' CHECK (primary_identifier IN ('phone', 'email')),
ADD COLUMN fallback_identifier TEXT DEFAULT 'email' CHECK (fallback_identifier IN ('phone', 'email', 'none')),
ADD COLUMN auto_create_clients BOOLEAN DEFAULT true,
ADD COLUMN new_client_status TEXT DEFAULT 'active' CHECK (new_client_status IN ('active', 'inactive', 'paused')),
ADD COLUMN new_client_engagement TEXT DEFAULT 'medium' CHECK (new_client_engagement IN ('low', 'medium', 'high'));

-- Add constraint to ensure primary and fallback are different (unless fallback is 'none')
ALTER TABLE user_checkin_webhook_settings 
ADD CONSTRAINT check_different_identifiers 
CHECK (fallback_identifier = 'none' OR primary_identifier != fallback_identifier);

-- Update existing webhook settings with default values
UPDATE user_checkin_webhook_settings 
SET 
    primary_identifier = 'phone',
    fallback_identifier = 'email', 
    auto_create_clients = true,
    new_client_status = 'active',
    new_client_engagement = 'medium'
WHERE primary_identifier IS NULL;

-- Create index for better performance on phone/email lookups
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(coach_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(coach_id, email) WHERE email IS NOT NULL;