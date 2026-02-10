-- Add member_type to team_members: 'employee' | 'manager'
-- Managers are invited by the employer and get dashboard access; employees get employee app.
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'employee'
  CHECK (member_type IN ('employee', 'manager'));

-- Helper: returns org ids the user can manage (as owner or as manager). Uses SECURITY DEFINER
-- to avoid RLS recursion when policies on team_members reference this.
CREATE OR REPLACE FUNCTION get_org_ids_manageable_by_user(uid uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM organisations WHERE owner_id = uid
  UNION
  SELECT organisation_id FROM team_members WHERE user_id = uid AND member_type = 'manager' AND status = 'active'
$$;

-- RLS: allow managers to view/insert/update team (no self-reference to team_members in policy)
DROP POLICY IF EXISTS "Managers can view their org team" ON team_members;
DROP POLICY IF EXISTS "Managers can insert team members in their org" ON team_members;
DROP POLICY IF EXISTS "Managers can update their org team" ON team_members;
CREATE POLICY "Managers can view their org team" ON team_members FOR SELECT
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
CREATE POLICY "Managers can insert team members in their org" ON team_members FOR INSERT
  WITH CHECK (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
CREATE POLICY "Managers can update their org team" ON team_members FOR UPDATE
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

-- Team member roles/venues: use helper to avoid team_members self-reference
CREATE POLICY "Managers can manage team_member_roles" ON team_member_roles FOR ALL
  USING (team_member_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))));
CREATE POLICY "Managers can manage team_member_venues" ON team_member_venues FOR ALL
  USING (team_member_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))));

-- Roles, Venues, Rota, Allocations, Invites, Timekeeping: use helper (no team_members in policy)
CREATE POLICY "Managers can view roles in their org" ON roles FOR SELECT
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
CREATE POLICY "Managers can manage roles in their org" ON roles FOR ALL
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

CREATE POLICY "Managers can view venues in their org" ON venues FOR SELECT
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));
CREATE POLICY "Managers can manage venues in their org" ON venues FOR ALL
  USING (organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

CREATE POLICY "Managers can manage shifts in their org" ON rota_shifts FOR ALL
  USING (venue_id IN (
    SELECT v.id FROM venues v
    WHERE v.organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))
  ));

CREATE POLICY "Managers can manage allocations in their org" ON shift_allocations FOR ALL
  USING (rota_shift_id IN (
    SELECT rs.id FROM rota_shifts rs
    JOIN venues v ON rs.venue_id = v.id
    WHERE v.organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))
  ));

CREATE POLICY "Managers can manage shift invites in their org" ON shift_invites FOR ALL
  USING (rota_shift_id IN (
    SELECT rs.id FROM rota_shifts rs
    JOIN venues v ON rs.venue_id = v.id
    WHERE v.organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))
  ));

CREATE POLICY "Managers can view timekeeping in their org" ON timekeeping_records FOR SELECT
  USING (venue_id IN (
    SELECT v.id FROM venues v
    WHERE v.organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))
  ));
CREATE POLICY "Managers can update timekeeping in their org" ON timekeeping_records FOR UPDATE
  USING (venue_id IN (
    SELECT v.id FROM venues v
    WHERE v.organisation_id IN (SELECT get_org_ids_manageable_by_user(auth.uid()))
  ));

-- Managers can view organisations they belong to (use helper to avoid recursion when reading organisations)
CREATE POLICY "Managers can view their org" ON organisations FOR SELECT
  USING (id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

