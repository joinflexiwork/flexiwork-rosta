-- =============================================================================
-- FlexiWork Rosta: Phase 1–4 Complete Workflow
-- Single migration: schema, RPCs, RLS. Maintains existing RLS patterns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PHASE 1: Invite & Onboarding
-- -----------------------------------------------------------------------------

-- team_members: employment_type (allow gig), invite_status, onboarded_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'invite_status'
  ) THEN
    ALTER TABLE team_members ADD COLUMN invite_status VARCHAR(20) DEFAULT 'pending'
      CHECK (invite_status IN ('pending', 'accepted', 'declined'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'onboarded_at'
  ) THEN
    ALTER TABLE team_members ADD COLUMN onboarded_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Allow 'gig' in employment_type (keep existing full_time, part_time)
DO $$
BEGIN
  ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_employment_type_check;
  ALTER TABLE team_members ADD CONSTRAINT team_members_employment_type_check
    CHECK (employment_type IN ('full_time', 'part_time', 'full-time', 'part-time', 'gig'));
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- shift_allocations: allocation_type (direct/invite), confirmation_status
ALTER TABLE shift_allocations
  ADD COLUMN IF NOT EXISTS allocation_type VARCHAR(20) DEFAULT 'direct';
ALTER TABLE shift_allocations
  ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(20) DEFAULT 'auto-confirmed'
  CHECK (confirmation_status IN ('auto-confirmed', 'pending', 'confirmed', 'declined'));

DO $$
BEGIN
  ALTER TABLE shift_allocations DROP CONSTRAINT IF EXISTS shift_allocations_allocation_type_check;
  ALTER TABLE shift_allocations ADD CONSTRAINT shift_allocations_allocation_type_check
    CHECK (allocation_type IN ('direct', 'accepted', 'invite'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

UPDATE shift_allocations SET confirmation_status = 'auto-confirmed' WHERE confirmation_status IS NULL;
UPDATE shift_allocations SET allocation_type = COALESCE(allocation_type, 'direct');

-- -----------------------------------------------------------------------------
-- PHASE 2: Roster & Shift Invites (cross-branch)
-- -----------------------------------------------------------------------------

ALTER TABLE shift_invites
  ADD COLUMN IF NOT EXISTS invite_scope VARCHAR(20) DEFAULT 'specific'
  CHECK (invite_scope IN ('specific', 'all-branch', 'cross-branch'));
ALTER TABLE shift_invites
  ADD COLUMN IF NOT EXISTS target_venue_id UUID REFERENCES venues(id);
ALTER TABLE shift_invites
  ADD COLUMN IF NOT EXISTS required_role_id UUID REFERENCES roles(id);

CREATE TABLE IF NOT EXISTS cross_branch_availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  available_venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(worker_id, available_venue_id)
);

CREATE INDEX IF NOT EXISTS idx_cross_branch_availability_venue
  ON cross_branch_availability(available_venue_id);
CREATE INDEX IF NOT EXISTS idx_cross_branch_availability_worker
  ON cross_branch_availability(worker_id);

-- -----------------------------------------------------------------------------
-- PHASE 3: Timekeeping (GPS, approval, breaks)
-- -----------------------------------------------------------------------------

ALTER TABLE timekeeping_records
  ADD COLUMN IF NOT EXISTS clock_in_method VARCHAR(20) DEFAULT 'manual'
  CHECK (clock_in_method IN ('manual', 'gps', 'qr'));
ALTER TABLE timekeeping_records
  ADD COLUMN IF NOT EXISTS clock_out_method VARCHAR(20)
  CHECK (clock_out_method IN ('manual', 'gps', 'qr'));
ALTER TABLE timekeeping_records
  ADD COLUMN IF NOT EXISTS break_duration_minutes INTEGER DEFAULT 0;
ALTER TABLE timekeeping_records
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending'
  CHECK (approval_status IN ('pending', 'approved', 'rejected', 'disputed'));
ALTER TABLE timekeeping_records
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES team_members(id);
ALTER TABLE timekeeping_records
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE timekeeping_records
  ADD COLUMN IF NOT EXISTS manager_notes TEXT;

CREATE TABLE IF NOT EXISTS break_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  shift_duration_hours INTEGER NOT NULL,
  break_duration_minutes INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  reminder_type VARCHAR(50) NOT NULL
    CHECK (reminder_type IN ('break', 'clock-out', 'shift-soon')),
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  is_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_reminders_worker ON worker_reminders(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_reminders_scheduled ON worker_reminders(scheduled_for) WHERE is_sent = false;

-- -----------------------------------------------------------------------------
-- PHASE 4: Timesheets & Payout
-- -----------------------------------------------------------------------------
-- Drop and recreate so schema always matches (avoids "column period_start does not exist"
-- when timesheets existed from a partial run with different structure).
DROP TABLE IF EXISTS timesheets CASCADE;
DROP TABLE IF EXISTS payout_records CASCADE;

CREATE TABLE timesheets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
  regular_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
  hourly_rate DECIMAL(10,2),
  total_earnings DECIMAL(10,2),
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid', 'disputed')),
  approved_by UUID REFERENCES team_members(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  payout_reference VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(worker_id, period_start, period_end)
);

CREATE TABLE payout_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  payout_period_start DATE NOT NULL,
  payout_period_end DATE NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  worker_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed')),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timesheets_worker ON timesheets(worker_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_period ON timesheets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payout_records_org ON payout_records(organisation_id);

-- invite_type for team vs gig (add before RPC that uses it)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invite_type VARCHAR(20) DEFAULT 'team';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_members_invite_type_check'
  ) THEN
    ALTER TABLE team_members ADD CONSTRAINT team_members_invite_type_check
      CHECK (invite_type IN ('team', 'gig'));
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- RPC: validate_invite_code(p_code TEXT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_invite_code(p_code TEXT)
RETURNS TABLE(valid BOOLEAN, email TEXT, invite_type TEXT, organisation_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    true,
    tm.email,
    COALESCE(tm.invite_type, 'team')::TEXT,
    tm.organisation_id
  FROM team_members tm
  WHERE tm.invite_code = UPPER(TRIM(p_code))
    AND tm.status = 'pending'
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT, NULL::UUID;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: accept_invite_with_confirmation (team invite: set invite_status, onboarded_at)
-- Called from API after signup/signin; service role or auth.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_invite_with_confirmation(
  p_invite_code TEXT,
  p_user_id UUID,
  p_employment_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tm RECORD;
BEGIN
  SELECT * INTO v_tm
  FROM team_members
  WHERE invite_code = UPPER(TRIM(p_invite_code))
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite not found or already used');
  END IF;

  UPDATE team_members
  SET
    user_id = p_user_id,
    status = 'active',
    joined_at = NOW(),
    invite_status = 'accepted',
    onboarded_at = NOW(),
    employment_type = COALESCE(NULLIF(TRIM(p_employment_type), ''), employment_type)
  WHERE id = v_tm.id;

  RETURN jsonb_build_object('success', true, 'team_member_id', v_tm.id);
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: clock_in_with_validation(p_shift_id UUID, p_team_member_id UUID, p_location TEXT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION clock_in_with_validation(
  p_shift_id UUID,
  p_team_member_id UUID,
  p_location TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift RECORD;
  v_rec RECORD;
BEGIN
  SELECT rs.id, rs.venue_id INTO v_shift
  FROM rota_shifts rs
  WHERE rs.id = p_shift_id AND rs.status IN ('published', 'in_progress');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Shift not found or not open for clock-in');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM shift_allocations
    WHERE rota_shift_id = p_shift_id AND team_member_id = p_team_member_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not allocated to this shift');
  END IF;

  INSERT INTO timekeeping_records (
    rota_shift_id, team_member_id, venue_id,
    clock_in, clock_in_location, clock_in_method, status, approval_status
  ) VALUES (
    p_shift_id, p_team_member_id, v_shift.venue_id,
    NOW(), p_location, CASE WHEN p_location IS NOT NULL AND p_location != '' THEN 'gps' ELSE 'manual' END,
    'pending', 'pending'
  )
  RETURNING * INTO v_rec;

  UPDATE shift_allocations
  SET status = 'in_progress'
  WHERE rota_shift_id = p_shift_id AND team_member_id = p_team_member_id;

  RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_rec));
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: generate_timesheet(p_worker_id UUID, p_start_date DATE, p_end_date DATE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_timesheet(
  p_worker_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total DECIMAL(10,2) := 0;
  v_regular DECIMAL(10,2) := 0;
  v_overtime DECIMAL(10,2) := 0;
  v_ts RECORD;
BEGIN
  SELECT
    COALESCE(SUM(total_hours), 0),
    COALESCE(SUM(regular_hours), 0),
    COALESCE(SUM(overtime_hours), 0)
  INTO v_total, v_regular, v_overtime
  FROM timekeeping_records
  WHERE team_member_id = p_worker_id
    AND (approval_status = 'approved' OR status = 'approved')
    AND clock_in::date >= p_start_date
    AND clock_in::date <= p_end_date
    AND clock_out IS NOT NULL;

  INSERT INTO timesheets (
    worker_id, period_start, period_end,
    total_hours, regular_hours, overtime_hours, status
  ) VALUES (
    p_worker_id, p_start_date, p_end_date,
    v_total, v_regular, v_overtime, 'draft'
  )
  ON CONFLICT (worker_id, period_start, period_end)
  DO UPDATE SET
    total_hours = EXCLUDED.total_hours,
    regular_hours = EXCLUDED.regular_hours,
    overtime_hours = EXCLUDED.overtime_hours,
    status = 'draft'
  RETURNING * INTO v_ts;

  RETURN jsonb_build_object(
    'success', true,
    'timesheet_id', v_ts.id,
    'total_hours', v_total,
    'regular_hours', v_regular,
    'overtime_hours', v_overtime
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: pull_available_workers(p_venue_id UUID, p_role_id UUID, p_shift_date DATE, p_shift_id UUID)
-- Returns team_members from same org (or cross_branch_availability) not on this shift
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pull_available_workers(
  p_venue_id UUID,
  p_role_id UUID DEFAULT NULL,
  p_shift_date DATE DEFAULT NULL,
  p_shift_id UUID DEFAULT NULL
)
RETURNS TABLE(
  team_member_id UUID,
  full_name TEXT,
  email TEXT,
  employment_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tm.id,
    p.full_name,
    tm.email,
    tm.employment_type
  FROM venues v
  JOIN organisations o ON o.id = v.organisation_id
  JOIN team_members tm ON tm.organisation_id = o.id AND tm.status = 'active'
  LEFT JOIN profiles p ON p.id = tm.user_id
  LEFT JOIN cross_branch_availability cba ON cba.worker_id = tm.id AND cba.available_venue_id = p_venue_id AND cba.is_available
  WHERE (v.id = p_venue_id OR cba.worker_id IS NOT NULL)
    AND tm.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM shift_allocations sa
      WHERE sa.team_member_id = tm.id
        AND (p_shift_id IS NULL OR sa.rota_shift_id = p_shift_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM shift_invites si
      WHERE si.team_member_id = tm.id AND si.status = 'pending'
        AND (p_shift_id IS NULL OR si.rota_shift_id = p_shift_id)
    )
  LIMIT 50;
END;
$$;

-- -----------------------------------------------------------------------------
-- Update accept_shift_invite_atomic to set confirmation_status = 'confirmed'
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_shift_invite_atomic(
  p_invite_id UUID,
  p_team_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
  v_shift RECORD;
  v_filled INT;
  v_allocation RECORD;
BEGIN
  SELECT * INTO v_invite
  FROM shift_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.status != 'pending' THEN
    RAISE EXCEPTION 'Invite is no longer valid';
  END IF;

  IF v_invite.team_member_id != p_team_member_id THEN
    RAISE EXCEPTION 'Invite does not belong to this team member';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE id = p_team_member_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to accept this invite';
  END IF;

  SELECT headcount_needed INTO v_shift
  FROM rota_shifts
  WHERE id = v_invite.rota_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  SELECT COUNT(*)::INT INTO v_filled
  FROM shift_allocations
  WHERE rota_shift_id = v_invite.rota_shift_id;

  IF v_filled >= COALESCE(v_shift.headcount_needed, 1) THEN
    UPDATE shift_invites
    SET status = 'expired', responded_at = NOW()
    WHERE id = p_invite_id;
    RAISE EXCEPTION 'This shift has been filled by another employee';
  END IF;

  INSERT INTO shift_allocations (
    rota_shift_id,
    team_member_id,
    allocation_type,
    status,
    allocated_by,
    confirmation_status
  ) VALUES (
    v_invite.rota_shift_id,
    p_team_member_id,
    'accepted',
    'confirmed',
    auth.uid(),
    'confirmed'
  )
  RETURNING * INTO v_allocation;

  UPDATE shift_invites
  SET status = 'accepted', responded_at = NOW()
  WHERE id = p_invite_id;

  IF v_filled + 1 >= COALESCE(v_shift.headcount_needed, 1) THEN
    UPDATE shift_invites
    SET status = 'expired', responded_at = NOW()
    WHERE rota_shift_id = v_invite.rota_shift_id AND status = 'pending';
  END IF;

  RETURN to_jsonb(v_allocation);
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS: New tables
-- -----------------------------------------------------------------------------
ALTER TABLE cross_branch_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers view own cross_branch_availability"
  ON cross_branch_availability FOR SELECT
  USING (worker_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Managers manage cross_branch_availability"
  ON cross_branch_availability FOR ALL
  USING (
    available_venue_id IN (
      SELECT id FROM venues WHERE organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "Org can manage break_rules"
  ON break_rules FOR ALL
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

CREATE POLICY "Workers view own reminders"
  ON worker_reminders FOR SELECT
  USING (worker_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "Workers view own timesheets"
  ON timesheets FOR SELECT
  USING (worker_id IN (SELECT id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Managers view org timesheets"
  ON timesheets FOR SELECT
  USING (
    worker_id IN (
      SELECT tm.id FROM team_members tm
      JOIN organisations o ON o.id = tm.organisation_id
      WHERE o.owner_id = auth.uid()
    )
  );
CREATE POLICY "Managers update timesheets"
  ON timesheets FOR UPDATE
  USING (
    worker_id IN (
      SELECT tm.id FROM team_members tm
      JOIN organisations o ON o.id = tm.organisation_id
      WHERE o.owner_id = auth.uid()
    )
  );

CREATE POLICY "Org view payout_records"
  ON payout_records FOR SELECT
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));
CREATE POLICY "Org insert payout_records"
  ON payout_records FOR INSERT
  WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

-- Grants
GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_invite_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION accept_invite_with_confirmation(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invite_with_confirmation(TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION clock_in_with_validation(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_timesheet(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION pull_available_workers(UUID, UUID, DATE, UUID) TO authenticated;
