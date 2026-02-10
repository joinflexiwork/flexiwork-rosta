-- ============================================================
-- EMERGENCY RLS FIX - Run this in Supabase SQL Editor
-- Wipes and recreates policies. No self-referencing subqueries.
-- ============================================================

-- 1. Disable RLS temporarily to clean up
ALTER TABLE organisations DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE venues DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing policies (force drop every known name)
-- Organisations
DROP POLICY IF EXISTS "Users can view their own organisations" ON organisations;
DROP POLICY IF EXISTS "Users can insert their own organisations" ON organisations;
DROP POLICY IF EXISTS "Users can update their own organisations" ON organisations;
DROP POLICY IF EXISTS "Managers can view their org" ON organisations;
DROP POLICY IF EXISTS "Enable read access for users" ON organisations;
DROP POLICY IF EXISTS "Enable insert access for users" ON organisations;
DROP POLICY IF EXISTS "Enable update access for users" ON organisations;
DROP POLICY IF EXISTS "Users can view own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can insert own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can update own orgs" ON organisations;

-- Venues
DROP POLICY IF EXISTS "Users can view venues in their organisations" ON venues;
DROP POLICY IF EXISTS "Users can manage venues in their organisations" ON venues;
DROP POLICY IF EXISTS "Managers can view venues in their org" ON venues;
DROP POLICY IF EXISTS "Managers can manage venues in their org" ON venues;
DROP POLICY IF EXISTS "Users can view their venues" ON venues;
DROP POLICY IF EXISTS "Users can manage their venues" ON venues;

-- Roles
DROP POLICY IF EXISTS "Users can view roles in their organisations" ON roles;
DROP POLICY IF EXISTS "Users can manage roles in their organisations" ON roles;
DROP POLICY IF EXISTS "Managers can view roles in their org" ON roles;
DROP POLICY IF EXISTS "Managers can manage roles in their org" ON roles;
DROP POLICY IF EXISTS "Users can view their roles" ON roles;
DROP POLICY IF EXISTS "Users can manage their roles" ON roles;

-- Team members
DROP POLICY IF EXISTS "Employers can view their team" ON team_members;
DROP POLICY IF EXISTS "Employers can insert team members" ON team_members;
DROP POLICY IF EXISTS "Employers can update their team" ON team_members;
DROP POLICY IF EXISTS "Employees can view their own record" ON team_members;
DROP POLICY IF EXISTS "Employees can update own record on accept" ON team_members;
DROP POLICY IF EXISTS "Managers can view their org team" ON team_members;
DROP POLICY IF EXISTS "Managers can insert team members in their org" ON team_members;
DROP POLICY IF EXISTS "Managers can update their org team" ON team_members;
DROP POLICY IF EXISTS "Employers can view team" ON team_members;
DROP POLICY IF EXISTS "Employees can view self" ON team_members;
DROP POLICY IF EXISTS "Employers can insert team" ON team_members;

-- 3. Re-enable RLS
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- 4. Create CLEAN policies (organisations table only; no self-reference)

-- Organisations: direct owner check only (auth.uid() not auth.uuid())
CREATE POLICY "Users can view own orgs" ON organisations
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own orgs" ON organisations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own orgs" ON organisations
  FOR UPDATE USING (owner_id = auth.uid());

-- Venues: check via organisations table only
CREATE POLICY "Users can view their venues" ON venues
  FOR SELECT USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can manage their venues" ON venues
  FOR ALL USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

-- Roles: check via organisations table only
CREATE POLICY "Users can view their roles" ON roles
  FOR SELECT USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can manage their roles" ON roles
  FOR ALL USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

-- Team members: check via organisations table only (NEVER reference team_members in policy)
CREATE POLICY "Employers can view team" ON team_members
  FOR SELECT USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

CREATE POLICY "Employees can view self" ON team_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Employers can insert team" ON team_members
  FOR INSERT WITH CHECK (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

CREATE POLICY "Employers can update team" ON team_members
  FOR UPDATE USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

CREATE POLICY "Employees can update self" ON team_members
  FOR UPDATE USING (user_id = auth.uid());
