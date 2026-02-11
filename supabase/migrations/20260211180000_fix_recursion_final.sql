-- =============================================================================
-- FIX: Infinite recursion in RLS for team_members (code 42P17)
-- Timestamp: 20260211180000_fix_recursion_final.sql
--
-- WHAT CAUSED THE RECURSION:
-- The team_members policy "team_members_select_own_org" contained:
--   organisation_id IN (SELECT DISTINCT organisation_id FROM team_members tm2
--                       WHERE tm2.user_id = auth.uid())
-- To evaluate whether a row in team_members is visible, Postgres had to run
-- the subquery, which reads from team_members again. That read triggers RLS
-- on team_members again -> same policy -> same subquery -> infinite recursion.
--
-- FLOW THAT HIT THE BUG:
-- 1. Employer goes to /dashboard (no org yet).
-- 2. Layout calls getOrganisationIdForCurrentUser() -> getMyOrganisations().
-- 3. organisations query (owner_id = auth.uid()) returns 0 rows.
-- 4. Code then queries team_members (manager fallback) or RPC runs and JOINs
--    team_members. Either way, SELECT on team_members runs -> RLS evaluated
--    -> subquery FROM team_members -> recursion.
--
-- SOLUTION:
-- A helper table user_organisation_access (user_id, organisation_id) is
-- maintained by triggers on organisations and team_members. The team_members
-- SELECT policy uses ONLY: user_id = auth.uid() OR organisation_id IN
-- (SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid()).
-- So the policy never references team_members -> no recursion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper table: (user_id, organisation_id) for every user who can access an org
-- (owner from organisations, or member from team_members). No self-reference.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_organisation_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, organisation_id)
);

CREATE INDEX IF NOT EXISTS idx_user_org_access_user ON user_organisation_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_access_org ON user_organisation_access(organisation_id);

-- RLS: users can only see their own rows (used in policy expressions)
ALTER TABLE user_organisation_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own access" ON user_organisation_access;
CREATE POLICY "Users see own access" ON user_organisation_access
  FOR SELECT TO authenticated USING (user_id = auth.uid());

GRANT SELECT ON user_organisation_access TO authenticated;

-- Trigger: keep user_organisation_access in sync with organisations
CREATE OR REPLACE FUNCTION sync_user_org_access_on_organisations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.owner_id IS NOT NULL THEN
      INSERT INTO user_organisation_access (user_id, organisation_id)
      VALUES (NEW.owner_id, NEW.id)
      ON CONFLICT (user_id, organisation_id) DO NOTHING;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.owner_id IS NOT NULL AND OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
      DELETE FROM user_organisation_access WHERE user_id = OLD.owner_id AND organisation_id = OLD.id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.owner_id IS NOT NULL THEN
      DELETE FROM user_organisation_access WHERE user_id = OLD.owner_id AND organisation_id = OLD.id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trigger_sync_user_org_access_organisations ON organisations;
CREATE TRIGGER trigger_sync_user_org_access_organisations
  AFTER INSERT OR UPDATE OR DELETE ON organisations
  FOR EACH ROW EXECUTE FUNCTION sync_user_org_access_on_organisations();

-- Trigger: keep user_organisation_access in sync with team_members
CREATE OR REPLACE FUNCTION sync_user_org_access_on_team_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO user_organisation_access (user_id, organisation_id)
      VALUES (NEW.user_id, NEW.organisation_id)
      ON CONFLICT (user_id, organisation_id) DO NOTHING;
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) THEN
      IF OLD.user_id IS NOT NULL THEN
        DELETE FROM user_organisation_access WHERE user_id = OLD.user_id AND organisation_id = OLD.organisation_id;
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NOT NULL THEN
      DELETE FROM user_organisation_access WHERE user_id = OLD.user_id AND organisation_id = OLD.organisation_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trigger_sync_user_org_access_team_members ON team_members;
CREATE TRIGGER trigger_sync_user_org_access_team_members
  AFTER INSERT OR UPDATE OR DELETE ON team_members
  FOR EACH ROW EXECUTE FUNCTION sync_user_org_access_on_team_members();

-- -----------------------------------------------------------------------------
-- 2. ORGANISATIONS: drop all SELECT policies that reference team_members
--    then create non-recursive policies (owner OR access table only)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "org_select_owner" ON organisations;
DROP POLICY IF EXISTS "org_select_member" ON organisations;
DROP POLICY IF EXISTS "Enable read access for all users" ON organisations;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON organisations;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON organisations;
DROP POLICY IF EXISTS "organisations_select_policy" ON organisations;
DROP POLICY IF EXISTS "organisations_insert_policy" ON organisations;
DROP POLICY IF EXISTS "organisations_update_policy" ON organisations;
DROP POLICY IF EXISTS "Team members can view their org" ON organisations;
DROP POLICY IF EXISTS "Managers can view their org" ON organisations;
DROP POLICY IF EXISTS "Allow owners to view their org" ON organisations;
DROP POLICY IF EXISTS "Users can view orgs they own or manage" ON organisations;
DROP POLICY IF EXISTS "Users can view own orgs" ON organisations;

CREATE POLICY "org_select_owner" ON organisations
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "org_select_via_access" ON organisations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid())
  );

-- Ensure INSERT/UPDATE/DELETE for owners exist
DROP POLICY IF EXISTS "Users can insert own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can update own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can delete own orgs" ON organisations;
CREATE POLICY "Users can insert own orgs" ON organisations FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own orgs" ON organisations FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own orgs" ON organisations FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. TEAM_MEMBERS: drop recursive policy; create policy that does NOT
--    reference team_members (only user_id and user_organisation_access)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "team_members_select_own_org" ON team_members;
DROP POLICY IF EXISTS "team_members_select_policy" ON team_members;
DROP POLICY IF EXISTS "Employers can view team" ON team_members;
DROP POLICY IF EXISTS "Employees can view self" ON team_members;

-- Non-recursive: see own row(s) OR see rows in orgs you have access to (from helper table)
CREATE POLICY "team_members_select_own_or_org" ON team_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR organisation_id IN (
      SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid()
    )
  );

-- Re-add invite-code lookup if it was dropped (for accept-invite flow)
DROP POLICY IF EXISTS "Anyone can check invite codes" ON team_members;
CREATE POLICY "Anyone can check invite codes" ON team_members
  FOR SELECT TO authenticated
  USING (invite_code IS NOT NULL AND status = 'pending');

-- -----------------------------------------------------------------------------
-- 4. organisation_audit_logs: use user_organisation_access instead of
--    team_members subquery to avoid any indirect recursion
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_select_hierarchy" ON organisation_audit_logs;
DROP POLICY IF EXISTS "audit_select_policy" ON organisation_audit_logs;
DROP POLICY IF EXISTS "Org audit logs viewable by hierarchy" ON organisation_audit_logs;

CREATE POLICY "audit_select_hierarchy" ON organisation_audit_logs
  FOR SELECT TO authenticated
  USING (
    organisation_id IN (
      SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid()
    )
  );

-- Restrict to employer/gm/agm is done in application or a separate view; RLS here only grants org-level visibility.

-- -----------------------------------------------------------------------------
-- 5. Populate user_organisation_access (after policies are fixed; migration runs as owner so can read all rows)
-- -----------------------------------------------------------------------------
INSERT INTO user_organisation_access (user_id, organisation_id)
  SELECT owner_id, id FROM organisations WHERE owner_id IS NOT NULL
ON CONFLICT (user_id, organisation_id) DO NOTHING;

INSERT INTO user_organisation_access (user_id, organisation_id)
  SELECT user_id, organisation_id FROM team_members WHERE user_id IS NOT NULL
ON CONFLICT (user_id, organisation_id) DO NOTHING;
