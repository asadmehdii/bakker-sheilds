/*
  # Update checkins table to reference clients
  
  1. Changes
    - Add foreign key constraint from checkins.client_id to clients.id
    - Update existing checkins to link to clients table
    
  2. Security
    - Maintain existing RLS policies
*/

-- Add foreign key constraint to checkins table (client_id already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_checkins_client_id'
  ) THEN
    ALTER TABLE public.checkins 
    ADD CONSTRAINT fk_checkins_client_id 
    FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index on client_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_checkins_client_id ON public.checkins(client_id);
