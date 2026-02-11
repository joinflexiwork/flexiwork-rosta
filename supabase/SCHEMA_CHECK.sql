-- ============================================
-- SCHEMA CHECK: Run in Supabase SQL Editor first
-- Use this to verify team_members and notification_preferences columns
-- ============================================

-- 1. team_members columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'team_members'
ORDER BY ordinal_position;

-- 2. notification_preferences columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notification_preferences'
ORDER BY ordinal_position;
