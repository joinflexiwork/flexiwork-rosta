-- Break venues recursion: rota_shifts policy must NOT SELECT from venues (that re-triggers venues RLS).
-- Add get_venue_ids_manageable_by_user() (SECURITY DEFINER); use it in policies so no policy reads venues.

CREATE OR REPLACE FUNCTION get_venue_ids_manageable_by_user(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM venues
  WHERE organisation_id IN (SELECT get_org_ids_manageable_by_user(uid));
$$;

-- Venues: use only get_org_ids_manageable_by_user (no read of venues table from within venues policy)
DROP POLICY IF EXISTS "Venues select by org" ON venues;
DROP POLICY IF EXISTS "Venues insert by org" ON venues;
DROP POLICY IF EXISTS "Venues update by org" ON venues;
DROP POLICY IF EXISTS "Venues delete by org" ON venues;

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

-- Rota shifts: use venue ids from function (do NOT SELECT from venues in policy)
DROP POLICY IF EXISTS "Rota shifts all by org" ON rota_shifts;
DROP POLICY IF EXISTS "Rota shifts select for employees" ON rota_shifts;

CREATE POLICY "Rota shifts all by org"
  ON rota_shifts FOR ALL
  USING (venue_id IN (SELECT get_venue_ids_manageable_by_user(auth.uid())));

CREATE POLICY "Rota shifts select for employees"
  ON rota_shifts FOR SELECT
  USING (
    venue_id IN (
      SELECT venue_id FROM team_member_venues
      WHERE team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
    )
  );
