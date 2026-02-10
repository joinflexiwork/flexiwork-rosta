-- =============================================================================
-- EMERGENCY RLS RESET - No data loss. Drops recursive/complex policies,
-- restores minimal owner-based policies so employer dashboard loads.
-- If you have 20260208230000_get_my_organisations_rpc.sql, consider renaming
-- one (e.g. this to 20260208225000) so timestamps are unique.
-- =============================================================================

-- ========== STEP 1: DROP ALL PROBLEMATIC POLICIES ==========

-- Organisations (incl. function-based / manager policies that cause recursion)
DROP POLICY IF EXISTS "Orgs select owner" ON organisations;
DROP POLICY IF EXISTS "Orgs select manager" ON organisations;
DROP POLICY IF EXISTS "Users can view orgs they own or manage" ON organisations;
DROP POLICY IF EXISTS "Users can view orgs they manage" ON organisations;
DROP POLICY IF EXISTS "Allow owners to view their org" ON organisations;
DROP POLICY IF EXISTS "Managers can view their org" ON organisations;
DROP POLICY IF EXISTS "Users can view their own organisations" ON organisations;
DROP POLICY IF EXISTS "Users can view own orgs" ON organisations;
DROP POLICY IF EXISTS "Enable read access for users" ON organisations;
DROP POLICY IF EXISTS "Employees can view orgs of their allocated shifts" ON organisations;
DROP POLICY IF EXISTS "Users can insert own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can update own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can delete own orgs" ON organisations;

-- Venues
DROP POLICY IF EXISTS "Venues select by org" ON venues;
DROP POLICY IF EXISTS "Venues insert by org" ON venues;
DROP POLICY IF EXISTS "Venues update by org" ON venues;
DROP POLICY IF EXISTS "Venues delete by org" ON venues;
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

-- Rota_shifts
DROP POLICY IF EXISTS "Rota shifts all by org" ON rota_shifts;
DROP POLICY IF EXISTS "Rota shifts select for employees" ON rota_shifts;
DROP POLICY IF EXISTS "Employees can view shifts they are allocated to" ON rota_shifts;
DROP POLICY IF EXISTS "Employers can manage shifts" ON rota_shifts;
DROP POLICY IF EXISTS "Employees can view their shifts" ON rota_shifts;
DROP POLICY IF EXISTS "Employees can view shifts at their venues" ON rota_shifts;
DROP POLICY IF EXISTS "Managers can manage shifts in their org" ON rota_shifts;

-- Roles
DROP POLICY IF EXISTS "Roles select by org" ON roles;
DROP POLICY IF EXISTS "Roles insert by org" ON roles;
DROP POLICY IF EXISTS "Roles update by org" ON roles;
DROP POLICY IF EXISTS "Roles delete by org" ON roles;
DROP POLICY IF EXISTS "Users can view their roles" ON roles;
DROP POLICY IF EXISTS "Users can manage their roles" ON roles;
DROP POLICY IF EXISTS "Users can insert their roles" ON roles;
DROP POLICY IF EXISTS "Users can update their roles" ON roles;
DROP POLICY IF EXISTS "Users can delete their roles" ON roles;
DROP POLICY IF EXISTS "Users can view roles in their organisations" ON roles;
DROP POLICY IF EXISTS "Users can manage roles in their organisations" ON roles;
DROP POLICY IF EXISTS "Managers can view roles in their org" ON roles;
DROP POLICY IF EXISTS "Managers can manage roles in their org" ON roles;
DROP POLICY IF EXISTS "Employees can view roles of their allocated shifts" ON roles;

-- Team_members
DROP POLICY IF EXISTS "Employers can view team" ON team_members;
DROP POLICY IF EXISTS "Employees can view self" ON team_members;
DROP POLICY IF EXISTS "Employers can insert team" ON team_members;
DROP POLICY IF EXISTS "Employers can update team" ON team_members;
DROP POLICY IF EXISTS "Employees can update own record on accept" ON team_members;
DROP POLICY IF EXISTS "Employers can delete team" ON team_members;
DROP POLICY IF EXISTS "Anyone can check invite codes" ON team_members;

-- Shift_allocations
DROP POLICY IF EXISTS "Employers can manage allocations" ON shift_allocations;
DROP POLICY IF EXISTS "Employees can view their allocations" ON shift_allocations;
DROP POLICY IF EXISTS "Employees get allocation on accept" ON shift_allocations;
DROP POLICY IF EXISTS "Users can view their allocations" ON shift_allocations;

-- ========== STEP 2: MINIMAL WORKING POLICIES (no recursion) ==========
-- Chain: organisations (owner only) -> venues -> rota_shifts. team_members reads organisations only.
-- NO policy on organisations reads team_members (that would create org <-> team_members cycle).

-- ORGANISATIONS: owner only
CREATE POLICY "Owners can view own org"
  ON organisations FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can insert own org"
  ON organisations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update own org"
  ON organisations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete own org"
  ON organisations FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- VENUES: employers via organisations (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()))
CREATE POLICY "Employers can view venue orgs"
  ON venues FOR SELECT TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Employers can insert venues"
  ON venues FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Employers can update venues"
  ON venues FOR UPDATE TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Employers can delete venues"
  ON venues FOR DELETE TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

-- ROTA_SHIFTS: employers via venues -> organisations
CREATE POLICY "Employers can view shifts"
  ON rota_shifts FOR SELECT TO authenticated
  USING (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "Employers can manage shifts"
  ON rota_shifts FOR INSERT TO authenticated
  WITH CHECK (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "Employers can update shifts"
  ON rota_shifts FOR UPDATE TO authenticated
  USING (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "Employers can delete shifts"
  ON rota_shifts FOR DELETE TO authenticated
  USING (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );

-- ROLES: organisation owner only
CREATE POLICY "Employers can view roles"
  ON roles FOR SELECT TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Employers can insert roles"
  ON roles FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Employers can update roles"
  ON roles FOR UPDATE TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Employers can delete roles"
  ON roles FOR DELETE TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

-- TEAM_MEMBERS: user sees own row; owner sees team (organisations only, no back ref)
CREATE POLICY "Users can view own team row"
  ON team_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owners can view team"
  ON team_members FOR SELECT TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can insert team"
  ON team_members FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can update team"
  ON team_members FOR UPDATE TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can delete team"
  ON team_members FOR DELETE TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update own team row for accept"
  ON team_members FOR UPDATE TO authenticated
  USING (invite_code IS NOT NULL AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can check invite codes"
  ON team_members FOR SELECT
  USING (invite_code IS NOT NULL AND status = 'pending');

-- SHIFT_ALLOCATIONS: owners via rota_shifts -> venues -> organisations; employees own only
CREATE POLICY "Employers can manage allocations"
  ON shift_allocations FOR ALL TO authenticated
  USING (
    rota_shift_id IN (
      SELECT id FROM rota_shifts
      WHERE venue_id IN (
        SELECT id FROM venues
        WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      )
    )
  );

CREATE POLICY "Employees can view own allocations"
  ON shift_allocations FOR SELECT TO authenticated
  USING (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Employees can insert allocation on accept"
  ON shift_allocations FOR INSERT TO authenticated
  WITH CHECK (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

-- ========== STEP 3: Ensure RLS enabled ==========
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_allocations ENABLE ROW LEVEL SECURITY;
