-- =============================================================================
-- FIX: Infinite recursion on shift_allocations (and shift_invites).
-- Cycle was: shift_allocations → rota_shifts (owner path) → when evaluating
-- rota_shifts, "Shifts employee select allocated" reads shift_allocations → loop.
-- =============================================================================

-- 0. Break cycle: remove policy on rota_shifts that reads shift_allocations
DROP POLICY IF EXISTS "Shifts employee select allocated" ON rota_shifts;

-- 1. Drop ALL policies on shift_allocations (any name)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shift_allocations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON shift_allocations', r.policyname);
  END LOOP;
END $$;

-- 2. shift_allocations: only simple policies (no table in chain reads back to shift_allocations)
-- Owner: rota_shifts → venues → organisations (rota_shifts no longer reads shift_allocations)
CREATE POLICY "Shift allocations owner select"
  ON shift_allocations FOR SELECT TO authenticated
  USING (
    rota_shift_id IN (
      SELECT id FROM rota_shifts
      WHERE venue_id IN (
        SELECT id FROM venues
        WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      )
    )
  );

CREATE POLICY "Shift allocations owner insert"
  ON shift_allocations FOR INSERT TO authenticated
  WITH CHECK (
    rota_shift_id IN (
      SELECT id FROM rota_shifts
      WHERE venue_id IN (
        SELECT id FROM venues
        WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      )
    )
  );

CREATE POLICY "Shift allocations owner update"
  ON shift_allocations FOR UPDATE TO authenticated
  USING (
    rota_shift_id IN (
      SELECT id FROM rota_shifts
      WHERE venue_id IN (
        SELECT id FROM venues
        WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      )
    )
  );

CREATE POLICY "Shift allocations owner delete"
  ON shift_allocations FOR DELETE TO authenticated
  USING (
    rota_shift_id IN (
      SELECT id FROM rota_shifts
      WHERE venue_id IN (
        SELECT id FROM venues
        WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      )
    )
  );

-- Employee: only team_members (user_id) — team_members does not read shift_allocations
CREATE POLICY "Shift allocations employee select"
  ON shift_allocations FOR SELECT TO authenticated
  USING (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Shift allocations employee insert"
  ON shift_allocations FOR INSERT TO authenticated
  WITH CHECK (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

-- 3. Drop ALL policies on shift_invites (avoid similar recursion)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shift_invites'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON shift_invites', r.policyname);
  END LOOP;
END $$;

-- 4. shift_invites: owner path (rota_shifts → venues → organisations), employee path (team_members only)
CREATE POLICY "Shift invites owner select"
  ON shift_invites FOR SELECT TO authenticated
  USING (
    rota_shift_id IN (
      SELECT id FROM rota_shifts
      WHERE venue_id IN (
        SELECT id FROM venues
        WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      )
    )
  );

CREATE POLICY "Shift invites owner insert"
  ON shift_invites FOR INSERT TO authenticated
  WITH CHECK (
    rota_shift_id IN (
      SELECT id FROM rota_shifts
      WHERE venue_id IN (
        SELECT id FROM venues
        WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      )
    )
  );

CREATE POLICY "Shift invites owner update"
  ON shift_invites FOR UPDATE TO authenticated
  USING (
    rota_shift_id IN (
      SELECT id FROM rota_shifts
      WHERE venue_id IN (
        SELECT id FROM venues
        WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      )
    )
  );

CREATE POLICY "Shift invites owner delete"
  ON shift_invites FOR DELETE TO authenticated
  USING (
    rota_shift_id IN (
      SELECT id FROM rota_shifts
      WHERE venue_id IN (
        SELECT id FROM venues
        WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
      )
    )
  );

CREATE POLICY "Shift invites employee select"
  ON shift_invites FOR SELECT TO authenticated
  USING (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Shift invites employee update"
  ON shift_invites FOR UPDATE TO authenticated
  USING (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

-- 5. Ensure RLS on
ALTER TABLE shift_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_invites ENABLE ROW LEVEL SECURITY;
