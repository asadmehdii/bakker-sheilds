-- Check existing database schema before migration
-- Run this in Supabase SQL Editor to see what tables already exist

-- Check if clients table exists and its structure
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'clients'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check checkins table structure
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns  
WHERE table_name = 'checkins'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check existing data
SELECT 'clients' as table_name, COUNT(*) as row_count FROM clients
UNION ALL
SELECT 'checkins' as table_name, COUNT(*) as row_count FROM checkins;

-- Check checkins with client_id issues
SELECT 
    COUNT(*) as total_checkins,
    COUNT(CASE WHEN client_id IS NULL THEN 1 END) as null_client_id,
    COUNT(CASE WHEN client_id = '' THEN 1 END) as empty_client_id,
    COUNT(CASE WHEN client_name IS NOT NULL AND client_name != '' THEN 1 END) as has_client_name
FROM checkins;