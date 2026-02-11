-- Fix 42703: ensure notification_preferences has "channels" and "type" columns.
-- Some databases were created without one or both (e.g. different migration order).

-- channels: JSONB expected by app (e.g. { "email": true, "push": true, "in_app": true })
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '{"email": true, "push": true, "in_app": true}'::jsonb;

-- type: notification type id (e.g. shift_changes, weekly_summary)
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'shift_invite';

COMMENT ON COLUMN notification_preferences.channels IS 'Delivery channels and flags: email, push, in_app, enabled';
COMMENT ON COLUMN notification_preferences.type IS 'Notification type id, e.g. shift_changes, weekly_summary';

-- -----------------------------------------------------------------------------
-- Team members RLS: remove recursive policy (from 20260211230000).
-- That policy (team_members_select_own_org with subquery FROM team_members)
-- causes 42P17 recursion and prevents owners from seeing team members.
-- Ensure non-recursive policy exists: owner sees via organisations or
-- user_organisation_access; members see via user_organisation_access or own row.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "team_members_select_own_org" ON team_members;
DROP POLICY IF EXISTS "team_members_select_own_or_org" ON team_members;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_organisation_access') THEN
    CREATE POLICY "team_members_select_own_or_org" ON team_members
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR organisation_id IN (
          SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid()
        )
      );
  ELSE
    CREATE POLICY "team_members_select_own_or_org" ON team_members
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      );
  END IF;
END $$;
