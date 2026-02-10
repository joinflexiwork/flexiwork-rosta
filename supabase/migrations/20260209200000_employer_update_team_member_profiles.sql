-- Allow organisation owners to update profiles of users who are team_members in their organisation.
-- This enables the Worker Profile edit page to update full_name (and other profile fields) for employees.
-- Profiles table: typically RLS allows users to update their own row (id = auth.uid()).
-- We add a policy so that if the current user is the owner of an organisation, they can UPDATE
-- the profile of any user who is a team_member in that organisation.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow org owners to update team member profiles (e.g. full_name for worker profile management).
-- USING: allow update when the profile's id is the user_id of a team_member in an org owned by auth.uid().
CREATE POLICY "Org owners can update team member profiles" ON public.profiles
  FOR UPDATE
  USING (
    id IN (
      SELECT tm.user_id
      FROM public.team_members tm
      INNER JOIN public.organisations o ON o.id = tm.organisation_id
      WHERE o.owner_id = auth.uid()
        AND tm.user_id IS NOT NULL
    )
  )
  WITH CHECK (true);
