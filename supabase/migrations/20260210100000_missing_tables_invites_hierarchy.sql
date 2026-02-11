-- ==========================================
-- FLEXIWORK: Hiányzó táblák és team_members kiegészítés
-- Audit alapján: NEM hozunk létre meglévő táblákat.
-- Új: invites, management_chain, permissions, push_subscriptions.
-- Kapcsolatok: organisation_id, profiles(id).
-- ==========================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENUM (biztonságos)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hierarchy_level') THEN
    CREATE TYPE hierarchy_level AS ENUM ('employer', 'gm', 'agm', 'shift_leader', 'worker');
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. TEAM_MEMBERS kiegészítés (csak hiányzó oszlopok)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'hierarchy_level'
  ) THEN
    ALTER TABLE team_members ADD COLUMN hierarchy_level hierarchy_level DEFAULT 'worker';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'invited_by'
  ) THEN
    ALTER TABLE team_members ADD COLUMN invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'can_invite_managers'
  ) THEN
    ALTER TABLE team_members ADD COLUMN can_invite_managers boolean DEFAULT false;
  END IF;

  -- status: phase1-ben már van; ha valahol hiányzik
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'status'
  ) THEN
    ALTER TABLE team_members ADD COLUMN status text DEFAULT 'active';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. FÜGGVÉNY (organisation_id, profiles kontextus)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_org_ids_manageable_by_user(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM organisations WHERE owner_id = p_user_id
  UNION
  SELECT organisation_id FROM team_members
  WHERE user_id = p_user_id AND status = 'active'
    AND hierarchy_level IN ('employer', 'gm', 'agm', 'shift_leader');
$$;

-- -----------------------------------------------------------------------------
-- 4. INVITES (tokenizált meghívók)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  email text NOT NULL,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  hierarchy_level text NOT NULL CHECK (hierarchy_level IN ('employer', 'gm', 'agm', 'shift_leader', 'worker')),
  venue_ids uuid[],
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at timestamptz DEFAULT now(),
  accepted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  accepted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_organisation ON invites(organisation_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);

-- -----------------------------------------------------------------------------
-- 5. MANAGEMENT_CHAIN (hierarchia láncolat)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS management_chain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  subordinate_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(manager_id, subordinate_id)
);

CREATE INDEX IF NOT EXISTS idx_management_chain_manager ON management_chain(manager_id);
CREATE INDEX IF NOT EXISTS idx_management_chain_subordinate ON management_chain(subordinate_id);

-- -----------------------------------------------------------------------------
-- 6. PERMISSIONS (granuláris jogosultságok)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE UNIQUE,
  can_edit_rota boolean DEFAULT false,
  can_invite_managers boolean DEFAULT false,
  can_invite_workers boolean DEFAULT false,
  can_approve_timesheets boolean DEFAULT false,
  can_view_cross_branch_analytics boolean DEFAULT false,
  can_manage_venue_settings boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissions_team_member ON permissions(team_member_id);

-- -----------------------------------------------------------------------------
-- 7. PUSH_SUBSCRIPTIONS (web push)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  subscription jsonb NOT NULL,
  device_info text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- -----------------------------------------------------------------------------
-- 8. RLS: invites
-- -----------------------------------------------------------------------------
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can view invites in their org" ON invites;
CREATE POLICY "Managers can view invites in their org" ON invites FOR SELECT
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

DROP POLICY IF EXISTS "Managers can create invites in their org" ON invites;
CREATE POLICY "Managers can create invites in their org" ON invites FOR INSERT
  WITH CHECK (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

DROP POLICY IF EXISTS "Managers can update invites in their org" ON invites;
CREATE POLICY "Managers can update invites in their org" ON invites FOR UPDATE
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

DROP POLICY IF EXISTS "Managers can delete invites in their org" ON invites;
CREATE POLICY "Managers can delete invites in their org" ON invites FOR DELETE
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

-- -----------------------------------------------------------------------------
-- 9. RLS: management_chain
-- -----------------------------------------------------------------------------
ALTER TABLE management_chain ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view management chain in their org" ON management_chain;
CREATE POLICY "Users can view management chain in their org" ON management_chain FOR SELECT
  USING (
    created_by = auth.uid()
    OR manager_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())))
    OR subordinate_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())))
  );

DROP POLICY IF EXISTS "Managers can manage management chain" ON management_chain;
CREATE POLICY "Managers can manage management chain" ON management_chain FOR ALL
  USING (
    created_by = auth.uid()
    OR manager_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())))
  );

-- -----------------------------------------------------------------------------
-- 10. RLS: permissions
-- -----------------------------------------------------------------------------
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can view permissions in their org" ON permissions;
CREATE POLICY "Managers can view permissions in their org" ON permissions FOR SELECT
  USING (team_member_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))));

DROP POLICY IF EXISTS "Managers can manage permissions in their org" ON permissions;
CREATE POLICY "Managers can manage permissions in their org" ON permissions FOR ALL
  USING (team_member_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))));

-- -----------------------------------------------------------------------------
-- 11. RLS: push_subscriptions (saját rekordok)
-- -----------------------------------------------------------------------------
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can view own push subscriptions" ON push_subscriptions FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions" ON push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can update own push subscriptions" ON push_subscriptions FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions" ON push_subscriptions FOR DELETE USING (user_id = auth.uid());

COMMIT;
