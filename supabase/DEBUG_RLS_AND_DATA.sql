-- ============================================================
-- DEBUG: Isolate data vs permissions
-- Run each section in Supabase SQL Editor as needed.
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: Check if data actually exists
-- Run this first. If venues/roles return 0 rows, complete Setup at /dashboard/setup first.
-- ------------------------------------------------------------

-- Check if you have any venues
SELECT * FROM venues;

-- Check if you have any roles
SELECT * FROM roles;

-- Check if organisation exists and who owns it
SELECT id, name, owner_id FROM organisations;


-- ------------------------------------------------------------
-- STEP 2: Nuclear option - temporarily disable RLS to test
-- If Step 1 returned data but the app still shows "No venues", run this.
-- Then refresh the Team page. If venues appear, the issue is RLS read policy.
-- ------------------------------------------------------------

-- ALTER TABLE venues DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE roles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- STEP 3 (optional): Re-enable RLS with a permissive read policy
-- Only use if you confirmed data exists and disabling RLS made it visible.
-- This allows all SELECTs on venues (for debugging); replace with proper policy later.
-- ------------------------------------------------------------

-- ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "Allow all reads" ON venues;
-- CREATE POLICY "Allow all reads" ON venues FOR SELECT USING (true);
