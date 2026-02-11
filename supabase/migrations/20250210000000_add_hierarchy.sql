-- =============================================================================
-- FlexiWork Rosta: Hierarchy + Notifications schema
-- Run in Supabase SQL Editor or via supabase db push
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HIERARCHY: Enum and team_members extension
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE hierarchy_level AS ENUM ('employer', 'gm', 'agm', 'shift_leader', 'worker');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS hierarchy_level hierarchy_level DEFAULT 'worker';

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS can_invite_managers BOOLEAN DEFAULT false;

-- venue_scope: array of venue IDs this member can access (for GM/AGM)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS venue_scope UUID[];

-- Backfill: owners get 'employer', existing managers get 'gm', employees stay 'worker'
DO $$
BEGIN
  UPDATE team_members tm
  SET hierarchy_level = 'employer'
  WHERE EXISTS (
    SELECT 1 FROM organisations o WHERE o.owner_id = tm.user_id AND o.id = tm.organisation_id
  );
  UPDATE team_members tm
  SET hierarchy_level = 'gm'
  WHERE tm.member_type = 'manager' AND (tm.hierarchy_level IS NULL OR tm.hierarchy_level = 'worker');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Ensure get_org_ids_manageable_by_user exists before RLS policies (this migration runs before 20260206)
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
-- 2. MANAGEMENT CHAIN (who reports to whom)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS management_chain (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  subordinate_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(manager_id, subordinate_id)
);

CREATE INDEX IF NOT EXISTS idx_management_chain_manager ON management_chain(manager_id);
CREATE INDEX IF NOT EXISTS idx_management_chain_subordinate ON management_chain(subordinate_id);

-- -----------------------------------------------------------------------------
-- 3. PERMISSIONS (granular flags per team member)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE UNIQUE,
  can_edit_rota BOOLEAN DEFAULT false,
  can_invite_managers BOOLEAN DEFAULT false,
  can_invite_workers BOOLEAN DEFAULT false,
  can_approve_timesheets BOOLEAN DEFAULT false,
  can_view_cross_branch_analytics BOOLEAN DEFAULT false,
  can_manage_venue_settings BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_members_hierarchy ON team_members(hierarchy_level);

-- -----------------------------------------------------------------------------
-- 4. NOTIFICATIONS: Extend existing table + new tables
-- -----------------------------------------------------------------------------
-- Add new columns to existing notifications (keep existing 'read' for backward compat)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Migrate read boolean to read_at where applicable
UPDATE notifications SET read_at = NOW() WHERE read = true AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;

-- Notification preferences (per user, per type)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  channels JSONB DEFAULT '{"email": true, "push": true, "in_app": true}',
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '08:00',
  UNIQUE(user_id, type)
);

-- Push subscriptions (Web + Mobile)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  subscription JSONB NOT NULL,
  device_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- -----------------------------------------------------------------------------
-- 5. RLS: New tables
-- -----------------------------------------------------------------------------
ALTER TABLE management_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- management_chain: managers see their chain; org owners see all in org
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

-- permissions: same as team_members visibility
DROP POLICY IF EXISTS "Managers can view permissions in their org" ON permissions;
CREATE POLICY "Managers can view permissions in their org" ON permissions FOR SELECT
  USING (team_member_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))));

DROP POLICY IF EXISTS "Managers can manage permissions in their org" ON permissions;
CREATE POLICY "Managers can manage permissions in their org" ON permissions FOR ALL
  USING (team_member_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))));

-- notification_preferences: own only
DROP POLICY IF EXISTS "Users can manage own notification preferences" ON notification_preferences;
CREATE POLICY "Users can view own notification preferences" ON notification_preferences FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own notification preferences" ON notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own notification preferences" ON notification_preferences FOR UPDATE USING (user_id = auth.uid());

-- push_subscriptions: own only
DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can view own push subscriptions" ON push_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own push subscriptions" ON push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own push subscriptions" ON push_subscriptions FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own push subscriptions" ON push_subscriptions FOR DELETE USING (user_id = auth.uid());

-- Allow inserts for new notification types (authenticated callers; server/triggers use service role)
DROP POLICY IF EXISTS "Allow insert shift_accepted notifications" ON notifications;
CREATE POLICY "Allow insert notifications when authenticated" ON notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
