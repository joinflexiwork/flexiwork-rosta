-- Run this in Supabase SQL Editor to discover actual schema (for CRITICAL FIX PROTOCOL)
-- Copy results and use when fixing migrations.

-- 1. team_members actual columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'team_members'
ORDER BY ordinal_position;

-- 2. organisation_audit_logs actual columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'organisation_audit_logs'
ORDER BY ordinal_position;

-- 3. organisations existing columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'organisations'
ORDER BY ordinal_position;

-- 4. organisation_audit_logs constraint names
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.organisation_audit_logs'::regclass
  AND contype = 'c';
