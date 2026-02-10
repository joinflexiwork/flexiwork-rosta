-- =============================================================================
-- EMERGENCY ROLLBACK: Remove worker visibility policies that cause infinite
-- recursion (42P17) on venues. Restore system functionality; worker shift
-- details will be redesigned later with a non-recursive architecture.
-- =============================================================================

-- 1. Drop policies that cause recursion (use IF EXISTS for safe re-run)
DROP POLICY IF EXISTS "Shifts employee view allocated" ON rota_shifts;
DROP POLICY IF EXISTS "Venues employee view allocated" ON venues;
DROP POLICY IF EXISTS "Roles employee view allocated" ON roles;

-- 2. Drop the helper function (signature required for DROP FUNCTION)
DROP FUNCTION IF EXISTS get_rota_shift_ids_allocated_to_user(UUID);

-- No new policies. Owner-based policies from previous migrations remain.
-- Employer: venues/rota_shifts/roles via owner_id; employee: shift_allocations
-- and shift_invites via team_members only. Worker shift detail visibility TBD.
