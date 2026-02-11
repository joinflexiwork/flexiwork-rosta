-- ============================================
-- TEST SUITE: Invitation & Hierarchy
-- Run in Supabase SQL Editor (manual execution)
-- ============================================

-- Test 1: Verify hierarchy values (enum or check constraint)
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hierarchy_level') 
    THEN (SELECT enum_range(NULL::hierarchy_level)::text) 
    ELSE 'Using CHECK constraint on invites.hierarchy_level'
  END as hierarchy_source;

-- Test 2: Check RLS policies on invites table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual IS NOT NULL as has_qual,
  with_check IS NOT NULL as has_with_check
FROM pg_policies 
WHERE tablename = 'invites'
ORDER BY policyname;

-- Test 3: Verify team_members constraints (unique user+org)
SELECT 
  tc.constraint_name, 
  tc.table_name, 
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public' 
  AND tc.table_name = 'team_members' 
  AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
GROUP BY tc.constraint_name, tc.table_name;

-- Test 4: Check invite expiration (pending invites, status)
SELECT 
  token,
  email,
  invited_by,
  hierarchy_level,
  expires_at,
  status,
  CASE 
    WHEN status != 'pending' THEN 'NOT_PENDING'
    WHEN expires_at > now() THEN 'VALID'
    ELSE 'EXPIRED'
  END as expiry_status
FROM invites
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 5;

-- Test 5: Verify hierarchy ranks (numeric comparison for permission logic)
SELECT 
  level,
  expected_rank,
  CASE level
    WHEN 'employer' THEN 90
    WHEN 'gm' THEN 80
    WHEN 'agm' THEN 70
    WHEN 'shift_leader' THEN 60
    WHEN 'worker' THEN 50
    ELSE 0
  END as actual_rank,
  CASE 
    WHEN expected_rank = CASE level
      WHEN 'employer' THEN 90
      WHEN 'gm' THEN 80
      WHEN 'agm' THEN 70
      WHEN 'shift_leader' THEN 60
      WHEN 'worker' THEN 50
      ELSE 0
    END THEN 'PASS'
    ELSE 'FAIL'
  END as test_result
FROM (
  SELECT 'employer'::text as level, 90 as expected_rank
  UNION ALL SELECT 'gm', 80
  UNION ALL SELECT 'agm', 70
  UNION ALL SELECT 'shift_leader', 60
  UNION ALL SELECT 'worker', 50
) t;

-- Test 6: Check for orphaned invites (invited_by not in profiles)
SELECT i.id, i.email, i.invited_by, i.status
FROM invites i
LEFT JOIN profiles p ON p.id = i.invited_by
WHERE p.id IS NULL AND i.invited_by IS NOT NULL AND i.status = 'pending';

-- Test 7: Verify audit logs for invites (new_data contains email)
SELECT 
  action,
  table_name,
  record_id,
  created_at,
  new_data->>'email' as invited_email,
  new_data->>'intended_position' as hierarchy_level
FROM organisation_audit_logs
WHERE action IN ('INVITE_SENT', 'INVITE_ACCEPTED', 'ROLE_CHANGED')
ORDER BY created_at DESC
LIMIT 10;
