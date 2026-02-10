-- Fix "infinite recursion detected in policy for relation 'venues'".
-- Cause: a policy on venues (e.g. "Employees can view venues of their allocated shifts") selects from
-- rota_shifts, and rota_shifts policies select from venues -> venues -> rota_shifts -> venues.
-- Fix: Remove ALL policies that reference rota_shifts/shift_allocations; keep only simple org-based policies.

-- ========== VENUES: Drop every known policy name, then create only simple ones ==========
DROP POLICY IF EXISTS "Users can view their venues" ON venues;
DROP POLICY IF EXISTS "Users can manage their venues" ON venues;
DROP POLICY IF EXISTS "Users can insert their venues" ON venues;
DROP POLICY IF EXISTS "Users can update their venues" ON venues;
DROP POLICY IF EXISTS "Users can delete their venues" ON venues;
DROP POLICY IF EXISTS "Users can view venues in their organisations" ON venues;
DROP POLICY IF EXISTS "Users can manage venues in their organisations" ON venues;
DROP POLICY IF EXISTS "Managers can view venues in their org" ON venues;
DROP POLICY IF EXISTS "Managers can manage venues in their org" ON venues;
DROP POLICY IF EXISTS "Employees can view venues of their allocated shifts" ON venues;

CREATE POLICY "Venues select by org"
  ON venues FOR SELECT
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

CREATE POLICY "Venues insert by org"
  ON venues FOR INSERT
  WITH CHECK (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

CREATE POLICY "Venues update by org"
  ON venues FOR UPDATE
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

CREATE POLICY "Venues delete by org"
  ON venues FOR DELETE
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

-- ========== ROTA_SHIFTS: Remove policies that SELECT from venues (so venues no longer triggered from rota_shifts) ==========
-- Keep employer access via venue_id IN (SELECT id FROM venues ...) - that reads venues once; venues policies no longer read rota_shifts.
DROP POLICY IF EXISTS "Employees can view shifts they are allocated to" ON rota_shifts;
DROP POLICY IF EXISTS "Employers can manage shifts" ON rota_shifts;
DROP POLICY IF EXISTS "Employees can view their shifts" ON rota_shifts;
DROP POLICY IF EXISTS "Employees can view shifts at their venues" ON rota_shifts;
DROP POLICY IF EXISTS "Managers can manage shifts in their org" ON rota_shifts;

CREATE POLICY "Rota shifts all by org"
  ON rota_shifts FOR ALL
  USING (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))
    )
  );

-- Employees see shifts at venues they're assigned to (team_member_venues); no venues subquery that could recurse
CREATE POLICY "Rota shifts select for employees"
  ON rota_shifts FOR SELECT
  USING (
    venue_id IN (
      SELECT venue_id FROM team_member_venues
      WHERE team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
    )
  );

-- ========== ROLES: Same idea - only org-based, no rota_shifts/shift_allocations ==========
DROP POLICY IF EXISTS "Employees can view roles of their allocated shifts" ON roles;
DROP POLICY IF EXISTS "Users can view their roles" ON roles;
DROP POLICY IF EXISTS "Users can manage their roles" ON roles;
DROP POLICY IF EXISTS "Users can insert their roles" ON roles;
DROP POLICY IF EXISTS "Users can update their roles" ON roles;
DROP POLICY IF EXISTS "Users can delete their roles" ON roles;
DROP POLICY IF EXISTS "Users can view roles in their organisations" ON roles;
DROP POLICY IF EXISTS "Users can manage roles in their organisations" ON roles;
DROP POLICY IF EXISTS "Managers can view roles in their org" ON roles;
DROP POLICY IF EXISTS "Managers can manage roles in their org" ON roles;

CREATE POLICY "Roles select by org"
  ON roles FOR SELECT
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

CREATE POLICY "Roles insert by org"
  ON roles FOR INSERT
  WITH CHECK (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

CREATE POLICY "Roles update by org"
  ON roles FOR UPDATE
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

CREATE POLICY "Roles delete by org"
  ON roles FOR DELETE
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
