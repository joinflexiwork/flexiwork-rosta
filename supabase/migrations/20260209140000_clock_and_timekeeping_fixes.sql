-- =============================================================================
-- Clock In/Out fixes: get_shift_for_clock RPC, already-clocked-in check,
-- clock_out sets total_hours, organisations.break_rules JSONB (optional default).
-- Run after audit_fixes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. get_shift_for_clock(p_rota_shift_id UUID)
-- Returns shift + allocation + timekeeping for current user. Use auth.uid() to
-- resolve team_member_id. Gives specific error codes for UI.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_shift_for_clock(p_rota_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_tm_id UUID;
  v_shift RECORD;
  v_allocation RECORD;
  v_timekeeping RECORD;
BEGIN
  SELECT id INTO v_tm_id FROM team_members WHERE user_id = auth.uid() LIMIT 1;
  IF v_tm_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_allocated', 'message', 'You are not assigned to this shift');
  END IF;

  SELECT rs.id, rs.shift_date, rs.start_time, rs.end_time, rs.status, rs.venue_id, rs.role_id
  INTO v_shift
  FROM rota_shifts rs
  WHERE rs.id = p_rota_shift_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'shift_not_found', 'message', 'Shift not found');
  END IF;

  IF v_shift.status NOT IN ('published', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'shift_not_published', 'message', 'This shift is not yet published');
  END IF;

  SELECT * INTO v_allocation
  FROM shift_allocations
  WHERE rota_shift_id = p_rota_shift_id AND team_member_id = v_tm_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_allocated', 'message', 'You are not assigned to this shift');
  END IF;

  SELECT * INTO v_timekeeping
  FROM timekeeping_records
  WHERE rota_shift_id = p_rota_shift_id AND team_member_id = v_tm_id
  ORDER BY clock_in DESC NULLS LAST
  LIMIT 1;

  IF FOUND AND v_timekeeping.clock_out IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'shift_completed', 'message', 'Shift already completed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'team_member_id', v_tm_id,
    'shift', (
      SELECT jsonb_build_object(
        'id', rs.id, 'shift_date', rs.shift_date, 'start_time', rs.start_time, 'end_time', rs.end_time,
        'status', rs.status, 'venue_id', rs.venue_id, 'role_id', rs.role_id,
        'venue', (SELECT to_jsonb(v) FROM venues v WHERE v.id = rs.venue_id),
        'role', (SELECT to_jsonb(r) FROM roles r WHERE r.id = rs.role_id)
      )
      FROM rota_shifts rs WHERE rs.id = p_rota_shift_id
    ),
    'allocation', to_jsonb(v_allocation),
    'timekeeping', CASE WHEN v_timekeeping.id IS NOT NULL THEN to_jsonb(v_timekeeping) ELSE 'null'::jsonb END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_shift_for_clock(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. clock_in_with_validation: check "already clocked in" before insert
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
  IF EXISTS (
    SELECT 1 FROM timekeeping_records
    WHERE rota_shift_id = p_shift_id AND team_member_id = p_team_member_id AND clock_in IS NOT NULL AND clock_out IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already clocked in');
  END IF;

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
-- 3. clock_out_with_validation: set total_hours (duration - break)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION clock_out_with_validation(
  p_timekeeping_record_id UUID,
  p_team_member_id UUID,
  p_location TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_shift RECORD;
  v_break_mins INT := 0;
  v_duration_hours DECIMAL(10,4);
  v_total_hours DECIMAL(10,4);
BEGIN
  SELECT * INTO v_rec
  FROM timekeeping_records
  WHERE id = p_timekeeping_record_id
    AND team_member_id = p_team_member_id
    AND clock_out IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Record not found or already clocked out');
  END IF;

  SELECT rs.shift_date, rs.start_time, rs.end_time INTO v_shift
  FROM rota_shifts rs WHERE rs.id = v_rec.rota_shift_id;

  IF v_shift.end_time IS NOT NULL AND v_shift.start_time IS NOT NULL THEN
    SELECT COALESCE(br.break_duration_minutes, 0) INTO v_break_mins
    FROM break_rules br
    JOIN venues v ON v.organisation_id = br.organisation_id AND v.id = v_rec.venue_id
    WHERE br.shift_duration_hours <= (
      EXTRACT(EPOCH FROM (v_shift.end_time - v_shift.start_time)) / 3600
    )::INTEGER
    ORDER BY br.shift_duration_hours DESC
    LIMIT 1;
  END IF;

  v_duration_hours := EXTRACT(EPOCH FROM (NOW() - v_rec.clock_in)) / 3600.0;
  v_total_hours := GREATEST(0, v_duration_hours - (COALESCE(v_break_mins, 0) / 60.0));

  UPDATE timekeeping_records
  SET
    clock_out = NOW(),
    clock_out_location = p_location,
    clock_out_method = CASE WHEN p_location IS NOT NULL AND p_location != '' THEN 'gps' ELSE 'manual' END,
    break_duration_minutes = COALESCE(break_duration_minutes, v_break_mins),
    total_hours = v_total_hours
  WHERE id = p_timekeeping_record_id
  RETURNING * INTO v_rec;

  UPDATE shift_allocations
  SET status = 'completed'
  WHERE rota_shift_id = v_rec.rota_shift_id AND team_member_id = p_team_member_id;

  RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_rec));
END;
$$;

-- organisations.break_rules JSONB for optional per-org overrides (4h/6h defaults)
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS break_rules JSONB DEFAULT '{"4h_break": 15, "6h_break": 30}';
