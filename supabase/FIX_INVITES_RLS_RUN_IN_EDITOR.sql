-- ============================================
-- FIX: Invites RLS INSERT policy
-- Run in Supabase SQL Editor
-- ============================================
-- Ensures only authenticated managers/owners can create invites.
-- get_org_ids_manageable_by_user returns orgs where user is owner OR
-- has hierarchy_level in (employer, gm, agm, shift_leader).
-- ============================================

DROP POLICY IF EXISTS "Managers can create invites in their org" ON invites;

CREATE POLICY "Managers can create invites in their org"
ON invites
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND organisation_id IN (
    SELECT get_org_ids_manageable_by_user(auth.uid())
  )
);
