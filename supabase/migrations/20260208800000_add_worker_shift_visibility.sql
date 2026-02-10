-- =============================================================================
-- Worker shift visibility: allow workers to read rota_shifts, venues, roles
-- for shifts they are allocated to. Uses SECURITY DEFINER function to avoid
-- recursion: rota_shifts policy must not read shift_allocations via RLS
-- (shift_allocations owner policy reads rota_shifts → cycle).
-- =============================================================================

-- Function returns rota_shift_ids where the user has an allocation.
-- SECURITY DEFINER so it runs without triggering shift_allocations RLS in a way
-- that would re-enter rota_shifts (breaking the cycle).
CREATE OR REPLACE FUNCTION get_rota_shift_ids_allocated_to_user(p_uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT rota_shift_id
  FROM shift_allocations
  WHERE team_member_id IN (SELECT id FROM team_members WHERE user_id = p_uid);
$$;

-- 1. rota_shifts: workers see shifts they are allocated to (via function, no recursion)
CREATE POLICY "Shifts employee view allocated"
  ON rota_shifts FOR SELECT TO authenticated
  USING (id IN (SELECT get_rota_shift_ids_allocated_to_user(auth.uid())));

-- 2. venues: workers see venues of their allocated shifts
CREATE POLICY "Venues employee view allocated"
  ON venues FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT venue_id FROM rota_shifts
      WHERE id IN (SELECT get_rota_shift_ids_allocated_to_user(auth.uid()))
    )
  );

-- 3. roles: workers see roles of their allocated shifts
CREATE POLICY "Roles employee view allocated"
  ON roles FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT role_id FROM rota_shifts
      WHERE id IN (SELECT get_rota_shift_ids_allocated_to_user(auth.uid()))
    )
  );
