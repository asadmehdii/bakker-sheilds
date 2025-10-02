-- Add GoHighLevel integration support
-- This migration adds tables and columns needed for GHL OAuth and form selection

-- Update user_integrations to support GHL (table already exists)
-- The config JSONB will store:
-- - access_token (encrypted in production)
-- - refresh_token (encrypted in production)
-- - location_id (GHL location/account ID)
-- - company_id (GHL company ID)
-- - expires_at (token expiration timestamp)

-- Create table to store selected GHL forms for monitoring
CREATE TABLE IF NOT EXISTS ghl_form_selections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  form_id VARCHAR(255) NOT NULL, -- GHL form ID
  form_name VARCHAR(500) NOT NULL, -- Human-readable form name
  location_id VARCHAR(255) NOT NULL, -- GHL location this form belongs to
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one user can't select the same form twice
  UNIQUE(user_id, form_id)
);

-- Create index for quick lookups
CREATE INDEX idx_ghl_form_selections_user_id ON ghl_form_selections(user_id);
CREATE INDEX idx_ghl_form_selections_integration_id ON ghl_form_selections(integration_id);
CREATE INDEX idx_ghl_form_selections_form_id ON ghl_form_selections(form_id);
CREATE INDEX idx_ghl_form_selections_active ON ghl_form_selections(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE ghl_form_selections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own form selections" 
ON ghl_form_selections FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own form selections" 
ON ghl_form_selections FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own form selections" 
ON ghl_form_selections FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own form selections" 
ON ghl_form_selections FOR DELETE 
USING (auth.uid() = user_id);

-- Create table to track GHL webhook subscriptions
CREATE TABLE IF NOT EXISTS ghl_webhook_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
  location_id VARCHAR(255) NOT NULL,
  ghl_webhook_id VARCHAR(255), -- GHL's webhook subscription ID (for unsubscribing)
  event_type VARCHAR(100) NOT NULL DEFAULT 'FormSubmitted',
  webhook_url TEXT NOT NULL, -- Our webhook URL that GHL calls
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One webhook subscription per integration
  UNIQUE(integration_id, location_id)
);

-- Create index for webhook lookups
CREATE INDEX idx_ghl_webhook_subs_location ON ghl_webhook_subscriptions(location_id);
CREATE INDEX idx_ghl_webhook_subs_integration ON ghl_webhook_subscriptions(integration_id);

-- Enable RLS
ALTER TABLE ghl_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own webhook subscriptions" 
ON ghl_webhook_subscriptions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own webhook subscriptions" 
ON ghl_webhook_subscriptions FOR ALL 
USING (auth.uid() = user_id);

-- Add index to user_integrations for faster GHL queries
CREATE INDEX IF NOT EXISTS idx_user_integrations_type_status 
ON user_integrations(type, status);

-- Add updated_at trigger for ghl_form_selections
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ghl_form_selections_updated_at 
  BEFORE UPDATE ON ghl_form_selections 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ghl_webhook_subscriptions_updated_at 
  BEFORE UPDATE ON ghl_webhook_subscriptions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

