-- FIX: Infinite recursion in profiles RLS policy
-- Use SECURITY DEFINER function to avoid policy-to-policy recursion

-- Drop problematic policies
DROP POLICY IF EXISTS "profiles_manager_update" ON public.profiles;
DROP POLICY IF EXISTS "Org owners can update team member profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_full_access" ON public.profiles;

-- Function: returns profile IDs that org owner/manager can update (no RLS recursion)
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

-- Simple policy: no nested subqueries that could trigger profiles
CREATE POLICY "profiles_manager_update" ON public.profiles
  FOR UPDATE
  USING (id IN (SELECT get_profile_ids_editable_by_manager()))
  WITH CHECK (true);
