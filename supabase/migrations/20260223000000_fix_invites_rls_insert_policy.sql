-- ============================================
-- FIX: Invites RLS INSERT policy - ensure proper WITH CHECK
-- Security: Only authenticated managers/owners can create invites
-- ============================================

-- 1. Drop the existing INSERT policy (may have been broken or overwritten)
DROP POLICY IF EXISTS "Managers can create invites in their org" ON invites;

-- 2. Create correct policy with explicit conditions
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
