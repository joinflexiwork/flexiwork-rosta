-- ============================================================
-- PHASE 1: Complete Schema
-- Profiles table MUST already exist (Supabase Auth). We only ADD columns.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STEP 1: Drop existing Phase 1 tables (if any)
-- ============================================================
DROP TABLE IF EXISTS timekeeping_records CASCADE;
DROP TABLE IF EXISTS shift_invites CASCADE;
DROP TABLE IF EXISTS shift_allocations CASCADE;
DROP TABLE IF EXISTS rota_shifts CASCADE;
DROP TABLE IF EXISTS team_member_venues CASCADE;
DROP TABLE IF EXISTS team_member_roles CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS venues CASCADE;
DROP TABLE IF EXISTS organisations CASCADE;

-- ============================================================
-- STEP 2: Modify existing PROFILES (do NOT create or drop)
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS worker_status TEXT DEFAULT 'inactive' CHECK (worker_status IN ('inactive', 'active'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_employee_profile BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_gig_profile BOOLEAN DEFAULT false;

-- ============================================================
-- 1. ORGANISATIONS
-- ============================================================
CREATE TABLE organisations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_reg_number TEXT,
  industry TEXT,
  billing_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 2. VENUES
-- ============================================================
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT DEFAULT 'Asia/Singapore',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 3. ROLES
-- ============================================================
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colour TEXT DEFAULT '#3B82F6',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 4. TEAM MEMBERS (user_id nullable for pending invites)
-- ============================================================
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('full_time', 'part_time')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  primary_venue_id UUID REFERENCES venues(id),
  invite_code TEXT UNIQUE,
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  joined_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- One user per organisation when user_id is set; multiple pending (null) allowed
CREATE UNIQUE INDEX team_members_org_user_unique ON team_members(organisation_id, user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 5. TEAM MEMBER ROLES
-- ============================================================
CREATE TABLE team_member_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_member_id, role_id)
);

-- ============================================================
-- 6. TEAM MEMBER VENUES
-- ============================================================
CREATE TABLE team_member_venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_member_id, venue_id)
);

-- ============================================================
-- 7. ROTA SHIFTS
-- ============================================================
CREATE TABLE rota_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  headcount_needed INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 8. SHIFT ALLOCATIONS
-- ============================================================
CREATE TABLE shift_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rota_shift_id UUID REFERENCES rota_shifts(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  allocation_type TEXT NOT NULL CHECK (allocation_type IN ('direct', 'accepted')),
  status TEXT DEFAULT 'allocated' CHECK (status IN ('allocated', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled')),
  allocated_by UUID REFERENCES profiles(id),
  allocated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(rota_shift_id, team_member_id)
);

-- ============================================================
-- 9. SHIFT INVITES
-- ============================================================
CREATE TABLE shift_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rota_shift_id UUID REFERENCES rota_shifts(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  invited_by UUID REFERENCES profiles(id),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(rota_shift_id, team_member_id)
);

-- ============================================================
-- 10. TIMEKEEPING RECORDS
-- ============================================================
CREATE TABLE timekeeping_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rota_shift_id UUID REFERENCES rota_shifts(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id),
  clock_in TIMESTAMP WITH TIME ZONE,
  clock_out TIMESTAMP WITH TIME ZONE,
  clock_in_location TEXT,
  clock_out_location TEXT,
  break_minutes INTEGER DEFAULT 0,
  total_hours DECIMAL(5,2),
  regular_hours DECIMAL(5,2),
  overtime_hours DECIMAL(5,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disputed', 'rejected')),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_venues_org ON venues(organisation_id);
CREATE INDEX IF NOT EXISTS idx_roles_org ON roles(organisation_id);
CREATE INDEX IF NOT EXISTS idx_team_members_org ON team_members(organisation_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_rota_shifts_venue ON rota_shifts(venue_id);
CREATE INDEX IF NOT EXISTS idx_rota_shifts_date ON rota_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_allocations_shift ON shift_allocations(rota_shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_invites_shift ON shift_invites(rota_shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_invites_member ON shift_invites(team_member_id);
CREATE INDEX IF NOT EXISTS idx_timekeeping_member ON timekeeping_records(team_member_id);

-- ============================================================
-- RLS POLICIES (Basic - expand as needed)
-- ============================================================

-- Organisations
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own organisations" ON organisations FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert their own organisations" ON organisations FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update their own organisations" ON organisations FOR UPDATE USING (owner_id = auth.uid());

-- Venues
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view venues in their organisations" ON venues FOR SELECT
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));
CREATE POLICY "Users can manage venues in their organisations" ON venues FOR ALL
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

-- Roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view roles in their organisations" ON roles FOR SELECT
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));
CREATE POLICY "Users can manage roles in their organisations" ON roles FOR ALL
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

-- Team Members
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employers can view their team" ON team_members FOR SELECT
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));
CREATE POLICY "Employers can insert team members" ON team_members FOR INSERT
  WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));
CREATE POLICY "Employers can update their team" ON team_members FOR UPDATE
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));
CREATE POLICY "Employees can view their own record" ON team_members FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Employees can update own record on accept" ON team_members FOR UPDATE
  USING (user_id = auth.uid());

-- Team Member Roles / Venues (follow organisation ownership)
ALTER TABLE team_member_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org can manage team_member_roles" ON team_member_roles FOR ALL
  USING (team_member_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())));

ALTER TABLE team_member_venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org can manage team_member_venues" ON team_member_venues FOR ALL
  USING (team_member_id IN (SELECT id FROM team_members WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())));

-- Rota Shifts
ALTER TABLE rota_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employers can manage shifts" ON rota_shifts FOR ALL
  USING (venue_id IN (
    SELECT v.id FROM venues v
    JOIN organisations o ON v.organisation_id = o.id
    WHERE o.owner_id = auth.uid()
  ));
CREATE POLICY "Employees can view shifts at their venues" ON rota_shifts FOR SELECT
  USING (venue_id IN (
    SELECT tmv.venue_id FROM team_member_venues tmv
    JOIN team_members tm ON tmv.team_member_id = tm.id
    WHERE tm.user_id = auth.uid()
  ));

-- Shift Allocations
ALTER TABLE shift_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their allocations" ON shift_allocations FOR SELECT
  USING (
    team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
    OR rota_shift_id IN (
      SELECT rs.id FROM rota_shifts rs
      JOIN venues v ON rs.venue_id = v.id
      JOIN organisations o ON v.organisation_id = o.id
      WHERE o.owner_id = auth.uid()
    )
  );
CREATE POLICY "Employers can manage allocations" ON shift_allocations FOR ALL
  USING (rota_shift_id IN (
    SELECT rs.id FROM rota_shifts rs
    JOIN venues v ON rs.venue_id = v.id
    JOIN organisations o ON v.organisation_id = o.id
    WHERE o.owner_id = auth.uid()
  ));
CREATE POLICY "Employees get allocation on accept" ON shift_allocations FOR INSERT
  WITH CHECK (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

-- Shift Invites
ALTER TABLE shift_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their invites" ON shift_invites FOR SELECT
  USING (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can respond to their invites" ON shift_invites FOR UPDATE
  USING (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Employers can manage invites" ON shift_invites FOR ALL
  USING (rota_shift_id IN (
    SELECT rs.id FROM rota_shifts rs
    JOIN venues v ON rs.venue_id = v.id
    JOIN organisations o ON v.organisation_id = o.id
    WHERE o.owner_id = auth.uid()
  ));

-- Timekeeping Records
ALTER TABLE timekeeping_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their timekeeping" ON timekeeping_records FOR SELECT
  USING (
    team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid())
    OR venue_id IN (
      SELECT v.id FROM venues v
      JOIN organisations o ON v.organisation_id = o.id
      WHERE o.owner_id = auth.uid()
    )
  );
CREATE POLICY "Employees can insert timekeeping" ON timekeeping_records FOR INSERT
  WITH CHECK (team_member_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Employers can update timekeeping" ON timekeeping_records FOR UPDATE
  USING (venue_id IN (
    SELECT v.id FROM venues v
    JOIN organisations o ON v.organisation_id = o.id
    WHERE o.owner_id = auth.uid()
  ));

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function to calculate hours between timestamps
CREATE OR REPLACE FUNCTION calculate_hours(
  clock_in_time TIMESTAMP WITH TIME ZONE,
  clock_out_time TIMESTAMP WITH TIME ZONE,
  break_mins INTEGER
) RETURNS DECIMAL AS $$
DECLARE
  total_mins INTEGER;
  work_mins INTEGER;
BEGIN
  total_mins := EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 60;
  work_mins := total_mins - COALESCE(break_mins, 0);
  RETURN ROUND((work_mins::DECIMAL / 60), 2);
END;
$$ LANGUAGE plpgsql;

-- Function to auto-calculate break time
CREATE OR REPLACE FUNCTION auto_break_time(hours DECIMAL) RETURNS INTEGER AS $$
BEGIN
  IF hours >= 6 THEN
    RETURN 30;
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timekeeping hours on clock out
CREATE OR REPLACE FUNCTION update_timekeeping_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_out IS NOT NULL AND NEW.clock_in IS NOT NULL THEN
    IF NEW.break_minutes = 0 THEN
      NEW.break_minutes := auto_break_time(
        EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600
      );
    END IF;

    NEW.total_hours := calculate_hours(NEW.clock_in, NEW.clock_out, NEW.break_minutes);
    NEW.regular_hours := LEAST(NEW.total_hours, 8);
    NEW.overtime_hours := GREATEST(NEW.total_hours - 8, 0);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_timekeeping_hours ON timekeeping_records;
CREATE TRIGGER trigger_update_timekeeping_hours
  BEFORE INSERT OR UPDATE ON timekeeping_records
  FOR EACH ROW
  EXECUTE PROCEDURE update_timekeeping_hours();
