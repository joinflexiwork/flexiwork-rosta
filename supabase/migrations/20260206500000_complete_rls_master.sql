-- ============================================================
-- COMPLETE RLS POLICY FIX - ENABLE ALL FRONTEND FUNCTIONS
-- Use existing tables only. No schema changes.
-- ============================================================

-- 1. ORGANISATIONS (Full CRUD for owner)
DROP POLICY IF EXISTS "Users can view own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can insert own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can update own orgs" ON organisations;
DROP POLICY IF EXISTS "Users can delete own orgs" ON organisations;

CREATE POLICY "Users can view own orgs" ON organisations FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own orgs" ON organisations FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own orgs" ON organisations FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Users can delete own orgs" ON organisations FOR DELETE USING (owner_id = auth.uid());

-- 2. VENUES (Full CRUD for org owner)
DROP POLICY IF EXISTS "Users can view their venues" ON venues;
DROP POLICY IF EXISTS "Users can manage their venues" ON venues;
DROP POLICY IF EXISTS "Users can insert their venues" ON venues;
DROP POLICY IF EXISTS "Users can update their venues" ON venues;
DROP POLICY IF EXISTS "Users can delete their venues" ON venues;

CREATE POLICY "Users can view their venues" ON venues FOR SELECT USING (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);
CREATE POLICY "Users can insert their venues" ON venues FOR INSERT WITH CHECK (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);
CREATE POLICY "Users can update their venues" ON venues FOR UPDATE USING (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);
CREATE POLICY "Users can delete their venues" ON venues FOR DELETE USING (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);

-- 3. ROLES (Full CRUD for org owner)
DROP POLICY IF EXISTS "Users can view their roles" ON roles;
DROP POLICY IF EXISTS "Users can manage their roles" ON roles;
DROP POLICY IF EXISTS "Users can insert their roles" ON roles;
DROP POLICY IF EXISTS "Users can update their roles" ON roles;
DROP POLICY IF EXISTS "Users can delete their roles" ON roles;

CREATE POLICY "Users can view their roles" ON roles FOR SELECT USING (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);
CREATE POLICY "Users can insert their roles" ON roles FOR INSERT WITH CHECK (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);
CREATE POLICY "Users can update their roles" ON roles FOR UPDATE USING (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);
CREATE POLICY "Users can delete their roles" ON roles FOR DELETE USING (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);

-- 4. TEAM_MEMBERS (Full CRUD for org owner + self-view/update for employees + accept-invite)
DROP POLICY IF EXISTS "Employers can view team" ON team_members;
DROP POLICY IF EXISTS "Employees can view self" ON team_members;
DROP POLICY IF EXISTS "Employers can insert team" ON team_members;
DROP POLICY IF EXISTS "Employers can update team" ON team_members;
DROP POLICY IF EXISTS "Employees can update own record on accept" ON team_members;
DROP POLICY IF EXISTS "Employers can delete team" ON team_members;

CREATE POLICY "Employers can view team" ON team_members FOR SELECT USING (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);
CREATE POLICY "Employees can view self" ON team_members FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Employers can insert team" ON team_members FOR INSERT WITH CHECK (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);
CREATE POLICY "Employers can update team" ON team_members FOR UPDATE USING (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);
CREATE POLICY "Employees can update own record on accept" ON team_members FOR UPDATE
  USING (invite_code IS NOT NULL AND status = 'pending')
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Employers can delete team" ON team_members FOR DELETE USING (
  organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
);

-- Allow lookup by invite_code for accept-invite page (unauthenticated or any user)
DROP POLICY IF EXISTS "Anyone can check invite codes" ON team_members;
CREATE POLICY "Anyone can check invite codes" ON team_members FOR SELECT USING (
  invite_code IS NOT NULL AND status = 'pending'
);

-- 5. TEAM_MEMBER_ROLES (Full CRUD for org owner)
DROP POLICY IF EXISTS "Org can manage team_member_roles" ON team_member_roles;
DROP POLICY IF EXISTS "Employers can manage member roles" ON team_member_roles;
CREATE POLICY "Employers can manage member roles" ON team_member_roles FOR ALL USING (
  team_member_id IN (
    SELECT id FROM team_members WHERE organisation_id IN (
      SELECT id FROM organisations WHERE owner_id = auth.uid()
    )
  )
);

-- 6. TEAM_MEMBER_VENUES (Full CRUD for org owner)
DROP POLICY IF EXISTS "Org can manage team_member_venues" ON team_member_venues;
DROP POLICY IF EXISTS "Employers can manage member venues" ON team_member_venues;
CREATE POLICY "Employers can manage member venues" ON team_member_venues FOR ALL USING (
  team_member_id IN (
    SELECT id FROM team_members WHERE organisation_id IN (
      SELECT id FROM organisations WHERE owner_id = auth.uid()
    )
  )
);

-- 7. ROTA_SHIFTS (Full CRUD for org owner + employee view)
DROP POLICY IF EXISTS "Employers can manage shifts" ON rota_shifts;
DROP POLICY IF EXISTS "Employees can view shifts at their venues" ON rota_shifts;
DROP POLICY IF EXISTS "Employees can view their shifts" ON rota_shifts;

CREATE POLICY "Employers can manage shifts" ON rota_shifts FOR ALL USING (
  venue_id IN (
    SELECT id FROM venues WHERE organisation_id IN (
      SELECT id FROM organisations WHERE owner_id = auth.uid()
    )
  )
);
CREATE POLICY "Employees can view their shifts" ON rota_shifts FOR SELECT USING (
  venue_id IN (
    SELECT venue_id FROM team_member_venues WHERE team_member_id IN (
      SELECT id FROM team_members WHERE user_id = auth.uid()
    )
  )
);

-- 8. SHIFT_ALLOCATIONS (Full CRUD for org owner + employee view)
DROP POLICY IF EXISTS "Users can view their allocations" ON shift_allocations;
DROP POLICY IF EXISTS "Employers can manage allocations" ON shift_allocations;
DROP POLICY IF EXISTS "Employees get allocation on accept" ON shift_allocations;
DROP POLICY IF EXISTS "Employees can view their allocations" ON shift_allocations;

CREATE POLICY "Employers can manage allocations" ON shift_allocations FOR ALL USING (
  rota_shift_id IN (
    SELECT id FROM rota_shifts WHERE venue_id IN (
      SELECT id FROM venues WHERE organisation_id IN (
        SELECT id FROM organisations WHERE owner_id = auth.uid()
      )
    )
  )
);
CREATE POLICY "Employees can view their allocations" ON shift_allocations FOR SELECT USING (
  team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "Employees get allocation on accept" ON shift_allocations FOR INSERT
  WITH CHECK (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

-- 9. SHIFT_INVITES (Full CRUD for org owner + employee view/update)
DROP POLICY IF EXISTS "Users can view their invites" ON shift_invites;
DROP POLICY IF EXISTS "Users can respond to their invites" ON shift_invites;
DROP POLICY IF EXISTS "Employers can manage invites" ON shift_invites;
DROP POLICY IF EXISTS "Employees can view their invites" ON shift_invites;
DROP POLICY IF EXISTS "Employees can respond to invites" ON shift_invites;

CREATE POLICY "Employers can manage invites" ON shift_invites FOR ALL USING (
  rota_shift_id IN (
    SELECT id FROM rota_shifts WHERE venue_id IN (
      SELECT id FROM venues WHERE organisation_id IN (
        SELECT id FROM organisations WHERE owner_id = auth.uid()
      )
    )
  )
);
CREATE POLICY "Employees can view their invites" ON shift_invites FOR SELECT USING (
  team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "Employees can respond to invites" ON shift_invites FOR UPDATE USING (
  team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
);

-- 10. TIMEKEEPING_RECORDS (Full CRUD for org owner + employee view/insert/update)
DROP POLICY IF EXISTS "Users can view their timekeeping" ON timekeeping_records;
DROP POLICY IF EXISTS "Employees can insert timekeeping" ON timekeeping_records;
DROP POLICY IF EXISTS "Employers can update timekeeping" ON timekeeping_records;
DROP POLICY IF EXISTS "Employers can manage timekeeping" ON timekeeping_records;
DROP POLICY IF EXISTS "Employees can view their timekeeping" ON timekeeping_records;
DROP POLICY IF EXISTS "Employees can clock in/out" ON timekeeping_records;
DROP POLICY IF EXISTS "Employees can update their timekeeping" ON timekeeping_records;

CREATE POLICY "Employers can manage timekeeping" ON timekeeping_records FOR ALL USING (
  venue_id IN (
    SELECT id FROM venues WHERE organisation_id IN (
      SELECT id FROM organisations WHERE owner_id = auth.uid()
    )
  )
);
CREATE POLICY "Employees can view their timekeeping" ON timekeeping_records FOR SELECT USING (
  team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "Employees can clock in/out" ON timekeeping_records FOR INSERT WITH CHECK (
  team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "Employees can update their timekeeping" ON timekeeping_records FOR UPDATE USING (
  team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
);

-- Ensure RLS is enabled on all tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_member_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE rota_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE timekeeping_records ENABLE ROW LEVEL SECURITY;
