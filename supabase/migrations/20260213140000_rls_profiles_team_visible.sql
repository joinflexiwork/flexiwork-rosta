-- CRITICAL: Allow organisation owner and members to SEE team_members and profiles.
-- Without this: owner sees 0 team members, profile form empty, GET 400, hierarchy 500.
-- Prerequisite: user_organisation_access table must exist (run 20260213130000_fix_rls_idempotent_safe.sql first).

-- ========== 1. team_members: owner must see ALL members (even if user_organisation_access missing) ==========
DROP POLICY IF EXISTS "team_members_select_own_org" ON team_members;
DROP POLICY IF EXISTS "team_members_select_own_or_org" ON team_members;

-- Single policy: own row OR in org you access via user_organisation_access OR org you own
CREATE POLICY "team_members_select_own_or_org" ON team_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR organisation_id IN (
      SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid()
    )
    OR organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

-- Re-apply invite policy if dropped
DROP POLICY IF EXISTS "Anyone can check invite codes" ON team_members;
CREATE POLICY "Anyone can check invite codes" ON team_members
  FOR SELECT TO authenticated
  USING (invite_code IS NOT NULL AND status = 'pending');

-- ========== 2. profiles: owner/members must READ team member profiles (not just update) ==========
-- Currently only "Users can view own profile" exists - owner cannot read team profiles for hierarchy/team page.
DROP POLICY IF EXISTS "Org members can view team profiles" ON public.profiles;
CREATE POLICY "Org members can view team profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR id IN (
      SELECT tm.user_id
      FROM public.team_members tm
      WHERE tm.user_id IS NOT NULL
        AND tm.organisation_id IN (
          SELECT organisation_id FROM user_organisation_access WHERE user_id = auth.uid()
        )
    )
    OR id IN (
      SELECT tm.user_id
      FROM public.team_members tm
      INNER JOIN public.organisations o ON o.id = tm.organisation_id
      WHERE o.owner_id = auth.uid() AND tm.user_id IS NOT NULL
    )
  );

-- ========== 3. profiles table: ensure columns exist (form empty if missing) ==========
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;

-- ========== 4. notification_preferences: channels + type (42703 fix) ==========
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '{"email": true, "push": true, "in_app": true}'::jsonb;
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'shift_invite';

-- ========== 5. Ensure user_organisation_access populated for existing owners ==========
INSERT INTO user_organisation_access (user_id, organisation_id)
  SELECT owner_id, id FROM organisations WHERE owner_id IS NOT NULL
ON CONFLICT (user_id, organisation_id) DO NOTHING;

INSERT INTO user_organisation_access (user_id, organisation_id)
  SELECT user_id, organisation_id FROM team_members WHERE user_id IS NOT NULL
ON CONFLICT (user_id, organisation_id) DO NOTHING;
