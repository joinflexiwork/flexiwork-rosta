-- Fix infinite recursion: stop using get_org_ids_manageable_by_user / get_venue_ids_manageable_by_user
-- in policy expressions. In some setups the definer still triggers RLS, causing recursion.
-- Use only direct subqueries that never form a cycle:
--   organisations: owner_id = auth.uid() OR id IN (SELECT organisation_id FROM team_members WHERE user_id = auth.uid() AND manager)
--   team_members for that: user_id = auth.uid() (no organisations read)
--   venues: organisation_id from (organisations owner) OR (team_members manager) -- no venues read
--   rota_shifts: venue_id IN (SELECT id FROM venues WHERE ...) -- venues policy does not read venues/rota_shifts

-- 1. Organisations: two policies, no function (avoids function re-entering RLS)
DROP POLICY IF EXISTS "Users can view orgs they own or manage" ON organisations;

CREATE POLICY "Orgs select owner"
  ON organisations FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Orgs select manager"
  ON organisations FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );

-- 2. Venues: only read organisations (owner) and team_members (manager) - never venues or rota_shifts
DROP POLICY IF EXISTS "Venues select by org" ON venues;
DROP POLICY IF EXISTS "Venues insert by org" ON venues;
DROP POLICY IF EXISTS "Venues update by org" ON venues;
DROP POLICY IF EXISTS "Venues delete by org" ON venues;

CREATE POLICY "Venues select by org"
  ON venues FOR SELECT
  USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR
    organisation_id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );

CREATE POLICY "Venues insert by org"
  ON venues FOR INSERT
  WITH CHECK (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR
    organisation_id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );

CREATE POLICY "Venues update by org"
  ON venues FOR UPDATE
  USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR
    organisation_id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );

CREATE POLICY "Venues delete by org"
  ON venues FOR DELETE
  USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR
    organisation_id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );

-- 3. Rota shifts: read venues (venues policy does not read venues/rota_shifts)
DROP POLICY IF EXISTS "Rota shifts all by org" ON rota_shifts;
DROP POLICY IF EXISTS "Rota shifts select for employees" ON rota_shifts;

CREATE POLICY "Rota shifts all by org"
  ON rota_shifts FOR ALL
  USING (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      OR organisation_id IN (
        SELECT organisation_id FROM team_members
        WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
      )
    )
  );

CREATE POLICY "Rota shifts select for employees"
  ON rota_shifts FOR SELECT
  USING (
    venue_id IN (
      SELECT venue_id FROM team_member_venues
      WHERE team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
    )
  );

-- 4. Roles: same pattern as venues (org owner or manager)
DROP POLICY IF EXISTS "Roles select by org" ON roles;
DROP POLICY IF EXISTS "Roles insert by org" ON roles;
DROP POLICY IF EXISTS "Roles update by org" ON roles;
DROP POLICY IF EXISTS "Roles delete by org" ON roles;

CREATE POLICY "Roles select by org"
  ON roles FOR SELECT
  USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR organisation_id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );

CREATE POLICY "Roles insert by org"
  ON roles FOR INSERT
  WITH CHECK (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR organisation_id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );

CREATE POLICY "Roles update by org"
  ON roles FOR UPDATE
  USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR organisation_id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );

CREATE POLICY "Roles delete by org"
  ON roles FOR DELETE
  USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    OR organisation_id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND member_type = 'manager' AND status = 'active'
    )
  );
