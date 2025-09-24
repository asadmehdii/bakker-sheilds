-- DIAGNOSIS: Check the exact structure and data in checkins table
-- Run this to understand what we're working with

-- 1. Check checkins table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns  
WHERE table_name = 'checkins'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Check sample data to see what client_id values look like
SELECT 
    client_id,
    client_name,
    coach_id,
    created_at
FROM checkins 
ORDER BY created_at DESC 
LIMIT 10;

-- 3. Check data distribution
SELECT 
    'Total checkins' as metric,
    COUNT(*) as count
FROM checkins
UNION ALL
SELECT 
    'Has client_name',
    COUNT(*)
FROM checkins 
WHERE client_name IS NOT NULL AND client_name != ''
UNION ALL
SELECT 
    'Has client_id',
    COUNT(*)
FROM checkins 
WHERE client_id IS NOT NULL
UNION ALL
SELECT 
    'Empty string client_id',
    COUNT(*)
FROM checkins 
WHERE client_id = ''
UNION ALL
SELECT 
    'Null client_id',
    COUNT(*)
FROM checkins 
WHERE client_id IS NULL;