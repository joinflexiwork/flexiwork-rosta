-- Restore team_members.user_id -> profiles(id) FK for schema cache / joins (e.g. profile:profiles(...)).
-- Invite flow (POST /api/invite/accept) already upserts profile then updates team_members, so FK won't block.
-- Clean up inconsistent data first, then add constraint with ON DELETE SET NULL.
-- DEFERRABLE allows profile + team_members update in one transaction (check at commit) if needed later.

-- 1. Backfill profiles for team_members.user_id that exist in auth.users but missing from profiles
INSERT INTO public.profiles (id, full_name, worker_status, user_type)
SELECT DISTINCT tm.user_id, 'Unknown', 'inactive', 'employee'
FROM team_members tm
WHERE tm.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = tm.user_id)
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = tm.user_id)
ON CONFLICT (id) DO NOTHING;

-- 2. Clear orphan user_id (no auth user and no profile) so FK can be added
UPDATE team_members
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = team_members.user_id);

-- 3. Re-add FK: enables schema relationship for Supabase client (e.g. .select('*, profile:profiles(...)'))
--    ON DELETE SET NULL: if profile is deleted, keep team_member row with user_id null
--    DEFERRABLE: allows profile insert + team_members update in same transaction (check at commit)
ALTER TABLE team_members
  ADD CONSTRAINT team_members_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;
