-- Fix "infinite recursion detected in policy for relation 'organisations'".
-- Cycle was: organisations (Orgs select manager) -> team_members -> organisations (Employers can view team).
-- Use get_org_ids_manageable_by_user() for managers; owners use direct check so they always see their org.

-- Ensure function exists (idempotent)
CREATE OR REPLACE FUNCTION get_org_ids_manageable_by_user(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM organisations WHERE owner_id = uid
  UNION
  SELECT organisation_id FROM team_members
  WHERE user_id = uid AND member_type = 'manager' AND status = 'active';
$$;

-- Organisations: owner sees own org via direct check (no function, no recursion); manager via function
DROP POLICY IF EXISTS "Orgs select owner" ON organisations;
DROP POLICY IF EXISTS "Orgs select manager" ON organisations;
DROP POLICY IF EXISTS "Users can view orgs they own or manage" ON organisations;

CREATE POLICY "Orgs select owner"
  ON organisations FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Users can view orgs they manage"
  ON organisations FOR SELECT TO authenticated
  USING (id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
