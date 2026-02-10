-- ============================================================
-- REVERT TO ORIGINAL STATE - Employer remains owner
-- Run in Supabase SQL Editor (service role)
-- ============================================================
-- EMPLOYER (Owner): joinfexiwork@gmail.com (no 'l')  → 3c4261c8-3a50-4041-99d1-d4c5ea00edb8
-- WORKER:          joinflexiwork@gmail.com (with 'l') → 4185174e-0a64-4586-8e8a-4fa3cc797c31
-- Organisation "Test cafe": id = ddcb1ccc-18a8-4a85-9ec7-5c9e78b33113
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. VERIFY / REVERT organisations.owner_id to EMPLOYER (do not leave as worker)
-- ---------------------------------------------------------------------------
UPDATE organisations
SET owner_id = '3c4261c8-3a50-4041-99d1-d4c5ea00edb8'
WHERE id = 'ddcb1ccc-18a8-4a85-9ec7-5c9e78b33113'
  AND (owner_id IS DISTINCT FROM '3c4261c8-3a50-4041-99d1-d4c5ea00edb8');

-- ---------------------------------------------------------------------------
-- 2. ENSURE employer profile exists (id = 3c4261c8...)
--    user_type is NOT NULL and must satisfy profiles_user_type_check (use 'employer' for org owner).
--    If this still fails, check allowed values: SELECT check_clause FROM information_schema.check_constraints WHERE constraint_name = 'profiles_user_type_check';
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, worker_status, user_type)
VALUES (
  '3c4261c8-3a50-4041-99d1-d4c5ea00edb8',
  'Owner',
  'inactive',
  'employer'
)
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  worker_status = EXCLUDED.worker_status,
  user_type = COALESCE(public.profiles.user_type, EXCLUDED.user_type);

-- ---------------------------------------------------------------------------
-- 3. CLEAN UP broken data from worker debugging
-- ---------------------------------------------------------------------------
-- 3a. Remove team_members where user_id = worker (incomplete/broken from debugging)
DELETE FROM team_members
WHERE user_id = '4185174e-0a64-4586-8e8a-4fa3cc797c31';

-- 3b. Remove broken pending invites for the worker email (joinflexiwork with 'l')
DELETE FROM team_members
WHERE email = 'joinflexiwork@gmail.com'
  AND status = 'pending';

-- ---------------------------------------------------------------------------
-- 4. ENSURE RLS allows employer (3c4261c8...) to SELECT their organisation
--    Use SECURITY DEFINER function for managers to avoid infinite recursion
--    (inline subquery on team_members would cause team_members RLS to query organisations again).
-- ---------------------------------------------------------------------------
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

-- Ensure helper exists (from migration 20260206100000 / 20260206200000)
CREATE OR REPLACE FUNCTION get_org_ids_manageable_by_user(uid uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM organisations WHERE owner_id = uid
  UNION
  SELECT organisation_id FROM team_members WHERE user_id = uid AND member_type = 'manager' AND status = 'active'
$$;

DROP POLICY IF EXISTS "Users can view their own organisations" ON organisations;
DROP POLICY IF EXISTS "Users can view own orgs" ON organisations;
DROP POLICY IF EXISTS "Managers can view their org" ON organisations;
DROP POLICY IF EXISTS "Allow owners to view their org" ON organisations;
DROP POLICY IF EXISTS "Enable read access for users" ON organisations;

CREATE POLICY "Allow owners to view their org"
  ON organisations FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can update own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can delete own orgs" ON organisations;

CREATE POLICY "Users can insert own orgs"
  ON organisations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own orgs"
  ON organisations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own orgs"
  ON organisations FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Managers: use function (no inline subquery on team_members → no recursion)
CREATE POLICY "Managers can view their org"
  ON organisations FOR SELECT TO authenticated
  USING (id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

-- ---------------------------------------------------------------------------
-- 5. VERIFICATION
-- ---------------------------------------------------------------------------
-- 5a. Employer can access their organisation (run as service role; when employer is logged in, RLS will allow this)
SELECT * FROM organisations
WHERE owner_id = '3c4261c8-3a50-4041-99d1-d4c5ea00edb8';

-- 5b. Organisation "Test cafe" has correct owner
SELECT id, name, owner_id,
       (owner_id = '3c4261c8-3a50-4041-99d1-d4c5ea00edb8') AS owner_is_employer
FROM organisations
WHERE id = 'ddcb1ccc-18a8-4a85-9ec7-5c9e78b33113';

-- 5c. Employer profile exists with expected data
SELECT id, full_name, worker_status
FROM public.profiles
WHERE id = '3c4261c8-3a50-4041-99d1-d4c5ea00edb8';

-- 5d. No broken team_members for worker in this org
SELECT COUNT(*) AS worker_team_members_remaining
FROM team_members
WHERE user_id = '4185174e-0a64-4586-8e8a-4fa3cc797c31';
-- Expect: 0

-- 5e. Auth user for employer
SELECT id, email FROM auth.users WHERE email = 'joinfexiwork@gmail.com';

-- ============================================================
-- MANUAL CHECK: Log in as joinfexiwork@gmail.com → open /dashboard
-- You should see "Test cafe" and full access (venues, team, shifts).
-- ============================================================
