-- Fix RLS: ensure owners can SELECT their organisation (owner_id = auth.uid())
-- Run this if getOrganisationIdForCurrentUser() returns 0 orgs despite correct owner_id in DB.

-- Drop all existing SELECT policies on organisations to avoid duplicates or conflicting names
DROP POLICY IF EXISTS "Users can view their own organisations" ON organisations;
DROP POLICY IF EXISTS "Users can view own orgs" ON organisations;
DROP POLICY IF EXISTS "Managers can view their org" ON organisations;
DROP POLICY IF EXISTS "Allow owners to view their org" ON organisations;
DROP POLICY IF EXISTS "Enable read access for users" ON organisations;

-- Ensure RLS is enabled
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

-- Single SELECT policy: authenticated users can see rows where they are the owner
CREATE POLICY "Allow owners to view their org"
  ON organisations
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- Restore INSERT/UPDATE/DELETE for owners (in case they were dropped)
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

-- Managers (team_members with member_type = 'manager') need to see their org for getMyOrganisations fallback
CREATE POLICY "Managers can view their org"
  ON organisations FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );
