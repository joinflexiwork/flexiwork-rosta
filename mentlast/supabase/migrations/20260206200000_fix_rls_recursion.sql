-- ============================================================
-- Fix RLS infinite recursion: use organisations only, never self-reference
-- Run this after phase1 and add_member_type to fix existing DBs
-- ============================================================

-- Step 1: Organisations - simple, non-recursive (owner_id only)
DROP POLICY IF EXISTS "Users can view their own organisations" ON organisations;
DROP POLICY IF EXISTS "Users can insert their own organisations" ON organisations;
DROP POLICY IF EXISTS "Users can update their own organisations" ON organisations;

CREATE POLICY "Users can view their own organisations"
  ON organisations FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own organisations"
  ON organisations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own organisations"
  ON organisations FOR UPDATE
  USING (owner_id = auth.uid());

-- Managers can view their org (must use function to avoid recursion)
DROP POLICY IF EXISTS "Managers can view their org" ON organisations;
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
CREATE POLICY "Managers can view their org" ON organisations FOR SELECT
  USING (id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

-- Step 2: Team members - use organisations table only, never team_members in policy
DROP POLICY IF EXISTS "Employers can view their team" ON team_members;
DROP POLICY IF EXISTS "Employers can insert team members" ON team_members;
DROP POLICY IF EXISTS "Employers can update their team" ON team_members;
DROP POLICY IF EXISTS "Employees can view their own record" ON team_members;
DROP POLICY IF EXISTS "Employees can update own record on accept" ON team_members;

CREATE POLICY "Employers can view their team"
  ON team_members FOR SELECT
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Employees can view their own record"
  ON team_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Employers can insert team members"
  ON team_members FOR INSERT
  WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Employers can update their team"
  ON team_members FOR UPDATE
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Employees can update own record on accept"
  ON team_members FOR UPDATE
  USING (user_id = auth.uid());

-- Re-create manager policies using function (no self-reference)
DROP POLICY IF EXISTS "Managers can view their org team" ON team_members;
DROP POLICY IF EXISTS "Managers can insert team members in their org" ON team_members;
DROP POLICY IF EXISTS "Managers can update their org team" ON team_members;

CREATE POLICY "Managers can view their org team" ON team_members FOR SELECT
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
CREATE POLICY "Managers can insert team members in their org" ON team_members FOR INSERT
  WITH CHECK (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
CREATE POLICY "Managers can update their org team" ON team_members FOR UPDATE
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

-- Step 3: Venues - organisations only
DROP POLICY IF EXISTS "Users can view venues in their organisations" ON venues;
DROP POLICY IF EXISTS "Users can manage venues in their organisations" ON venues;

CREATE POLICY "Users can view venues in their organisations"
  ON venues FOR SELECT
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can manage venues in their organisations"
  ON venues FOR ALL
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

-- Manager access to venues (use function)
DROP POLICY IF EXISTS "Managers can view venues in their org" ON venues;
DROP POLICY IF EXISTS "Managers can manage venues in their org" ON venues;
CREATE POLICY "Managers can view venues in their org" ON venues FOR SELECT
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
CREATE POLICY "Managers can manage venues in their org" ON venues FOR ALL
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
