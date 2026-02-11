-- ============================================
-- PHASE 1: Simplify RLS to eliminate recursion
-- Emergency Protocol - Senior Architect Implementation
-- ============================================
--
-- IMPACT ANALYSIS:
-- Affects: profiles, team_members tables (UPDATE policies only)
-- Risks: LOW - service role bypasses these anyway; writes go through server actions
-- Preserves: Invite system policies, all SELECT policies, all existing data
-- Validation: Run migration, verify no recursion errors in Supabase logs
--
-- NOTE: All WRITE operations for worker profile editing now go through
-- server actions with SERVICE ROLE (app/actions/team-member-actions.ts).
-- This eliminates RLS recursion completely.
-- ============================================

-- Drop recursive UPDATE policies on profiles
DROP POLICY IF EXISTS "profiles_manager_update" ON public.profiles;
DROP POLICY IF EXISTS "Org owners can update team member profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_full_access" ON public.profiles;

-- Drop recursive UPDATE policies on team_members
DROP POLICY IF EXISTS "team_members_manager_update" ON public.team_members;
DROP POLICY IF EXISTS "team_members_hierarchy_update" ON public.team_members;

-- Drop SECURITY DEFINER functions that cause recursion (used by above policies)
DROP FUNCTION IF EXISTS public.get_profile_ids_editable_by_manager();
DROP FUNCTION IF EXISTS public.can_update_team_member(uuid, uuid);

-- IMPORTANT: We do NOT add permissive "Enable read access for authenticated users"
-- That would expose all profiles/team_members to any authenticated user.
-- Existing SELECT policies remain intact:
--   - team_members_select_own_or_org (or equivalent)
--   - Org members can view team profiles
--   - Anyone can check invite codes (for invite flow)
--   - Employees can update own record on accept (for invite accept - client path)
