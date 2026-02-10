-- =============================================================================
-- NUCLEAR FIX: Venues / rota_shifts infinite recursion
-- Drop EVERY policy on venues and rota_shifts (by name from pg_policies),
-- then recreate ONLY owner-based policies. No team_members in chain = no cycle.
-- =============================================================================

-- 1. Drop ALL policies on venues (any name)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venues'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON venues', r.policyname);
  END LOOP;
END $$;

-- 2. Drop ALL policies on rota_shifts (any name)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rota_shifts'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON rota_shifts', r.policyname);
  END LOOP;
END $$;

-- 3. Venues: ONLY read organisations (owner_id). No team_members, no rota_shifts.
CREATE POLICY "Venues owner select"
  ON venues FOR SELECT TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Venues owner insert"
  ON venues FOR INSERT TO authenticated
  WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Venues owner update"
  ON venues FOR UPDATE TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Venues owner delete"
  ON venues FOR DELETE TO authenticated
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

-- 4. Rota_shifts: ONLY read venues -> organisations (owner). No team_member_venues, no team_members.
CREATE POLICY "Shifts owner select"
  ON rota_shifts FOR SELECT TO authenticated
  USING (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "Shifts owner insert"
  ON rota_shifts FOR INSERT TO authenticated
  WITH CHECK (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "Shifts owner update"
  ON rota_shifts FOR UPDATE TO authenticated
  USING (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "Shifts owner delete"
  ON rota_shifts FOR DELETE TO authenticated
  USING (
    venue_id IN (
      SELECT id FROM venues
      WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );

-- Workers: see rota_shifts where they have an allocation (no venues/organisations in this path = no recursion)
CREATE POLICY "Shifts employee select allocated"
  ON rota_shifts FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT rota_shift_id FROM shift_allocations
      WHERE team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
    )
  );

-- 5. Ensure RLS stays on
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_shifts ENABLE ROW LEVEL SECURITY;
