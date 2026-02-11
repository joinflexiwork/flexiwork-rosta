-- Allow org owner and managers to UPDATE team_members (hierarchy, status, etc.)

-- Function: check if current user can update a team member in the org
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
