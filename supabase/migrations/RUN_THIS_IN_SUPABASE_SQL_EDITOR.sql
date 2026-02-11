-- ============================================================
-- RUN THIS IN SUPABASE SQL EDITOR to fix Worker Profile editing
-- ============================================================
-- Fixes: RLS recursion, team_members UPDATE, notification_preferences columns

-- 1. FIX PROFILES RLS (infinite recursion)
DROP POLICY IF EXISTS "profiles_manager_update" ON public.profiles;
DROP POLICY IF EXISTS "Org owners can update team member profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_full_access" ON public.profiles;

CREATE OR REPLACE FUNCTION public.get_profile_ids_editable_by_manager()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tm.user_id
  FROM team_members tm
  WHERE tm.user_id IS NOT NULL
    AND tm.organisation_id IN (
      SELECT id FROM organisations WHERE owner_id = auth.uid()
      UNION
      SELECT organisation_id FROM team_members
        WHERE user_id = auth.uid()
        AND hierarchy_level::text IN ('employer', 'gm', 'agm')
    )
$$;

CREATE POLICY "profiles_manager_update" ON public.profiles
  FOR UPDATE
  USING (id IN (SELECT get_profile_ids_editable_by_manager()))
  WITH CHECK (true);

-- 2. FIX TEAM_MEMBERS UPDATE (allow owner/manager to update)
CREATE OR REPLACE FUNCTION public.can_update_team_member(p_org_id uuid, p_target_member_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisations o WHERE o.id = p_org_id AND o.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM team_members mgr
    JOIN team_members target ON target.organisation_id = mgr.organisation_id AND target.id = p_target_member_id
    WHERE mgr.user_id = auth.uid()
      AND mgr.organisation_id = p_org_id
      AND mgr.hierarchy_level::text IN ('employer', 'gm', 'agm')
      AND (
        mgr.hierarchy_level::text = 'employer'
        OR (mgr.hierarchy_level::text = 'gm' AND target.hierarchy_level::text IN ('agm', 'shift_leader', 'worker'))
        OR (mgr.hierarchy_level::text = 'agm' AND target.hierarchy_level::text IN ('shift_leader', 'worker'))
      )
  )
$$;

DROP POLICY IF EXISTS "team_members_manager_update" ON public.team_members;
DROP POLICY IF EXISTS "team_members_hierarchy_update" ON public.team_members;

CREATE POLICY "team_members_manager_update" ON public.team_members
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR can_update_team_member(organisation_id, id)
  )
  WITH CHECK (true);

-- 3. FIX NOTIFICATION_PREFERENCES (missing quiet_hours columns)
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_start time DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end time DEFAULT '08:00';
