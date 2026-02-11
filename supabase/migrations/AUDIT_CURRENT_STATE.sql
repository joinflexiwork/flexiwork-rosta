-- =============================================================================
-- AUDIT: Current database state. Run this in Supabase SQL Editor.
-- Copy the full result and use it to fix migrations.
-- =============================================================================

-- 1. Which of these tables exist?
SELECT 'TABLE_EXISTS' AS check_type, tablename AS name
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'user_organisation_access',
    'organisations',
    'team_members',
    'profiles',
    'notification_preferences',
    'organisation_audit_logs',
    'management_chain',
    'venues',
    'roles'
  )
ORDER BY tablename;

-- 2. Columns in notification_preferences
SELECT 'NOTIFICATION_PREFS_COLUMNS' AS check_type, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notification_preferences'
ORDER BY ordinal_position;

-- 3. Columns in profiles
SELECT 'PROFILES_COLUMNS' AS check_type, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 4. All RLS policies on key tables (name + table + command + qual expression)
SELECT 'POLICY' AS check_type,
  schemaname,
  tablename,
  policyname,
  cmd AS command,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'user_organisation_access',
    'organisations',
    'team_members',
    'profiles',
    'notification_preferences',
    'organisation_audit_logs'
  )
ORDER BY tablename, policyname;

-- 5. Row counts (data still there?)
-- If user_organisation_access exists, run separately: SELECT COUNT(*) FROM user_organisation_access;
SELECT 'ROW_COUNT' AS check_type, 'organisations' AS table_name, COUNT(*)::text AS cnt FROM organisations
UNION ALL
SELECT 'ROW_COUNT', 'team_members', COUNT(*)::text FROM team_members
UNION ALL
SELECT 'ROW_COUNT', 'profiles', COUNT(*)::text FROM profiles
UNION ALL
SELECT 'ROW_COUNT', 'notification_preferences', COUNT(*)::text FROM notification_preferences;

-- 6. RLS enabled on these tables?
SELECT 'RLS_ENABLED' AS check_type, relname AS table_name, relrowsecurity AS rls_on
FROM pg_class
WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND relname IN (
    'user_organisation_access', 'organisations', 'team_members', 'profiles',
    'notification_preferences', 'organisation_audit_logs'
  )
ORDER BY relname;
