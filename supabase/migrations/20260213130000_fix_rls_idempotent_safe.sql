-- Idempotent RLS fix: use pg_policies.policyname (not polname).
-- Run this after 20260211180000 or as standalone; safe to run multiple times.

-- ========== 0. Optional: list current policies (diagnostic) ==========
-- SELECT schemaname, tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('organisations', 'team_members', 'user_organisation_access', 'organisation_audit_logs')
-- ORDER BY tablename, policyname;

-- ========== 1. user_organisation_access (skip if table exists) ==========
CREATE TABLE IF NOT EXISTS user_organisation_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, organisation_id)
);

CREATE INDEX IF NOT EXISTS idx_user_org_access_user ON user_organisation_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_access_org ON user_organisation_access(organisation_id);

ALTER TABLE user_organisation_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own access" ON user_organisation_access;
CREATE POLICY "Users see own access" ON user_organisation_access
  FOR SELECT TO authenticated USING (user_id = auth.uid());

GRANT SELECT ON user_organisation_access TO authenticated;

-- Triggers
CREATE OR REPLACE FUNCTION sync_user_org_access_on_organisations()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

DROP TRIGGER IF EXISTS trigger_sync_user_org_access_organisations ON organisations;
CREATE TRIGGER trigger_sync_user_org_access_organisations
  AFTER INSERT OR UPDATE OR DELETE ON organisations
  FOR EACH ROW EXECUTE FUNCTION sync_user_org_access_on_organisations();

CREATE OR REPLACE FUNCTION sync_user_org_access_on_team_members()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

DROP TRIGGER IF EXISTS trigger_sync_user_org_access_team_members ON team_members;
CREATE TRIGGER trigger_sync_user_org_access_team_members
  AFTER INSERT OR UPDATE OR DELETE ON team_members
  FOR EACH ROW EXECUTE FUNCTION sync_user_org_access_on_team_members();

-- ========== 2. ORGANISATIONS policies ==========
DROP POLICY IF EXISTS "org_select_owner" ON organisations;
DROP POLICY IF EXISTS "org_select_via_access" ON organisations;
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organisations' AND policyname = 'org_select_owner') THEN
    CREATE POLICY "org_select_owner" ON organisations FOR SELECT TO authenticated USING (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organisations' AND policyname = 'org_select_via_access') THEN
    CREATE POLICY "org_select_via_access" ON organisations FOR SELECT TO authenticated
      USING (id IN (SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid()));
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can insert own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can update own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can delete own orgs" ON organisations;
CREATE POLICY "Users can insert own orgs" ON organisations FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own orgs" ON organisations FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own orgs" ON organisations FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ========== 3. TEAM_MEMBERS policies ==========
DROP POLICY IF EXISTS "team_members_select_own_org" ON team_members;
DROP POLICY IF EXISTS "team_members_select_own_or_org" ON team_members;
DROP POLICY IF EXISTS "team_members_select_policy" ON team_members;
DROP POLICY IF EXISTS "Employers can view team" ON team_members;
DROP POLICY IF EXISTS "Employees can view self" ON team_members;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'team_members' AND policyname = 'team_members_select_own_or_org') THEN
    CREATE POLICY "team_members_select_own_or_org" ON team_members FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR organisation_id IN (SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DROP POLICY IF EXISTS "Anyone can check invite codes" ON team_members;
CREATE POLICY "Anyone can check invite codes" ON team_members FOR SELECT TO authenticated
  USING (invite_code IS NOT NULL AND status = 'pending');

-- ========== 4. organisation_audit_logs ==========
DROP POLICY IF EXISTS "audit_select_hierarchy" ON organisation_audit_logs;
DROP POLICY IF EXISTS "audit_select_policy" ON organisation_audit_logs;
DROP POLICY IF EXISTS "Org audit logs viewable by hierarchy" ON organisation_audit_logs;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organisation_audit_logs' AND policyname = 'audit_select_hierarchy') THEN
    CREATE POLICY "audit_select_hierarchy" ON organisation_audit_logs FOR SELECT TO authenticated
      USING (organisation_id IN (SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ========== 5. Populate user_organisation_access ==========
INSERT INTO user_organisation_access (user_id, organisation_id)
  SELECT owner_id, id FROM organisations WHERE owner_id IS NOT NULL
ON CONFLICT (user_id, organisation_id) DO NOTHING;

INSERT INTO user_organisation_access (user_id, organisation_id)
  SELECT user_id, organisation_id FROM team_members WHERE user_id IS NOT NULL
ON CONFLICT (user_id, organisation_id) DO NOTHING;

-- ========== 6. notification_preferences columns (42703 fix) ==========
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '{"email": true, "push": true, "in_app": true}'::jsonb;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'shift_invite';

COMMENT ON COLUMN notification_preferences.channels IS 'Delivery channels and flags: email, push, in_app, enabled';
COMMENT ON COLUMN notification_preferences.type IS 'Notification type id, e.g. shift_changes, weekly_summary';
