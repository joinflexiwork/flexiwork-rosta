-- Workers can see rota_shifts, venues, roles, and organisations for shifts they are allocated to
-- (e.g. after accepting an invite they may not have team_member_venues for that venue yet)

-- Rota shifts: allow SELECT if user has a shift_allocation for this shift
CREATE POLICY "Employees can view shifts they are allocated to" ON rota_shifts FOR SELECT USING (
  id IN (
    SELECT rota_shift_id FROM shift_allocations
    WHERE team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
  )
);

-- Venues: allow SELECT if venue is used in a shift the user is allocated to
CREATE POLICY "Employees can view venues of their allocated shifts" ON venues FOR SELECT USING (
  id IN (
    SELECT venue_id FROM rota_shifts
    WHERE id IN (
      SELECT rota_shift_id FROM shift_allocations
      WHERE team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
    )
  )
);

-- Roles: allow SELECT if role is used in a shift the user is allocated to
CREATE POLICY "Employees can view roles of their allocated shifts" ON roles FOR SELECT USING (
  id IN (
    SELECT role_id FROM rota_shifts
    WHERE id IN (
      SELECT rota_shift_id FROM shift_allocations
      WHERE team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
    )
  )
);

-- Organisations: allow SELECT if org owns a venue of a shift the user is allocated to
CREATE POLICY "Employees can view orgs of their allocated shifts" ON organisations FOR SELECT USING (
  id IN (
    SELECT organisation_id FROM venues
    WHERE id IN (
      SELECT venue_id FROM rota_shifts
      WHERE id IN (
        SELECT rota_shift_id FROM shift_allocations
        WHERE team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
      )
    )
  )
);
