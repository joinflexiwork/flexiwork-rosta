-- =============================================================================
-- Audit triggers & functions check (run in Supabase SQL Editor)
-- Run this and report the results to verify why organisation_audit_logs is empty.
-- =============================================================================

-- 1. Triggers on team_members
SELECT '1. TRIGGERS ON team_members' AS check_section;
SELECT tgname AS trigger_name,
       CASE tgenabled
         WHEN 'O' THEN 'origin'
         WHEN 'D' THEN 'disabled'
         WHEN 'R' THEN 'replica'
         WHEN 'A' THEN 'always'
         ELSE tgenabled::text
       END AS enabled
FROM pg_trigger
WHERE tgrelid = 'public.team_members'::regclass
  AND NOT tgisinternal
ORDER BY tgname;

-- 2. Triggers on rota_shifts
SELECT '2. TRIGGERS ON rota_shifts' AS check_section;
SELECT tgname AS trigger_name,
       CASE tgenabled
         WHEN 'O' THEN 'origin'
         WHEN 'D' THEN 'disabled'
         WHEN 'R' THEN 'replica'
         WHEN 'A' THEN 'always'
         ELSE tgenabled::text
       END AS enabled
FROM pg_trigger
WHERE tgrelid = 'public.rota_shifts'::regclass
  AND NOT tgisinternal
ORDER BY tgname;

-- 3. Functions whose name contains 'audit'
SELECT '3. FUNCTIONS (name like %audit%)' AS check_section;
SELECT proname AS function_name
FROM pg_proc
WHERE proname ILIKE '%audit%'
ORDER BY proname;

-- 4. Row count in organisation_audit_logs
SELECT '4. organisation_audit_logs row count' AS check_section;
SELECT COUNT(*) AS audit_log_count FROM public.organisation_audit_logs;
