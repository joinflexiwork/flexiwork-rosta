-- =============================================================================
-- Audit fixes: race conditions, break rules, clock out, timesheet approval
-- Run after 20260209100000_phase1_4_complete_workflow.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RACE CONDITION: accept_shift_invite_atomic - time conflict check
-- When worker accepts one invite, reject if they already have overlapping shift.
-- After accept, expire other pending invites for same worker with overlapping times.
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

  SELECT rs.id, rs.shift_date, rs.start_time, rs.end_time, rs.headcount_needed
  INTO v_shift
  FROM rota_shifts rs
  WHERE rs.id = v_invite.rota_shift_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  -- Time conflict: worker already has a confirmed/active allocation at overlapping time
  IF EXISTS (
    SELECT 1
    FROM shift_allocations sa
    JOIN rota_shifts rs2 ON rs2.id = sa.rota_shift_id
    WHERE sa.team_member_id = p_team_member_id
      AND sa.rota_shift_id != v_invite.rota_shift_id
      AND sa.status IN ('allocated', 'confirmed', 'in_progress', 'completed')
      AND rs2.shift_date = v_shift.shift_date
      AND (rs2.start_time, rs2.end_time) OVERLAPS (v_shift.start_time, v_shift.end_time)
  ) THEN
    RAISE EXCEPTION 'You already have a shift at this time. Please decline one of the invites.';
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

  -- Expire other pending invites for THIS worker where the shift overlaps in time (first-come-first-served)
  UPDATE shift_invites si
  SET status = 'expired', responded_at = NOW()
  FROM rota_shifts rs_other
  WHERE si.team_member_id = p_team_member_id
    AND si.status = 'pending'
    AND si.id != p_invite_id
    AND si.rota_shift_id = rs_other.id
    AND rs_other.shift_date = v_shift.shift_date
    AND (rs_other.start_time, rs_other.end_time) OVERLAPS (v_shift.start_time, v_shift.end_time);

  IF v_filled + 1 >= COALESCE(v_shift.headcount_needed, 1) THEN
    UPDATE shift_invites
    SET status = 'expired', responded_at = NOW()
    WHERE rota_shift_id = v_invite.rota_shift_id AND status = 'pending';
  END IF;

  RETURN to_jsonb(v_allocation);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. BREAK RULES: Default rules per organisation (4h -> 15min, 6h -> 30min)
-- Break reminders: TODO - implement via Supabase Edge Function or pg_cron that:
-- 1. Inserts into worker_reminders (reminder_type='break', scheduled_for = shift start + duration/2 - break/2)
-- 2. Sends in-app notification (Realtime broadcast or push). See worker_reminders table.
-- -----------------------------------------------------------------------------
INSERT INTO break_rules (organisation_id, shift_duration_hours, break_duration_minutes, is_paid)
SELECT o.id, 4, 15, false
  FROM organisations o
  WHERE NOT EXISTS (SELECT 1 FROM break_rules br WHERE br.organisation_id = o.id AND br.shift_duration_hours = 4);

INSERT INTO break_rules (organisation_id, shift_duration_hours, break_duration_minutes, is_paid)
SELECT o.id, 6, 30, false
  FROM organisations o
  WHERE NOT EXISTS (SELECT 1 FROM break_rules br WHERE br.organisation_id = o.id AND br.shift_duration_hours = 6);

-- -----------------------------------------------------------------------------
-- 3. CLOCK OUT WITH VALIDATION RPC
-- Updates timekeeping record, sets break_duration from break_rules if needed,
-- updates shift_allocation to completed.
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

  UPDATE timekeeping_records
  SET
    clock_out = NOW(),
    clock_out_location = p_location,
    clock_out_method = CASE WHEN p_location IS NOT NULL AND p_location != '' THEN 'gps' ELSE 'manual' END,
    break_duration_minutes = COALESCE(break_duration_minutes, v_break_mins)
  WHERE id = p_timekeeping_record_id
  RETURNING * INTO v_rec;

  UPDATE shift_allocations
  SET status = 'completed'
  WHERE rota_shift_id = v_rec.rota_shift_id AND team_member_id = p_team_member_id;

  RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_rec));
END;
$$;

GRANT EXECUTE ON FUNCTION clock_out_with_validation(UUID, UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. TIMESHEET APPROVAL RPC (manager approves draft timesheet)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_timesheet(
  p_timesheet_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tm_id UUID;
  v_ts RECORD;
BEGIN
  SELECT worker_id INTO v_tm_id FROM timesheets WHERE id = p_timesheet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Timesheet not found');
  END IF;

  -- Manager = org owner of the worker's organisation (or same-org team member with update rights)
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN organisations o ON o.id = tm.organisation_id
    WHERE tm.id = v_tm_id AND o.owner_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to approve this timesheet');
  END IF;

  UPDATE timesheets
  SET status = 'approved',
      approved_by = (SELECT id FROM team_members WHERE user_id = auth.uid() AND organisation_id = (SELECT organisation_id FROM team_members WHERE id = v_tm_id) LIMIT 1),
      approved_at = NOW()
  WHERE id = p_timesheet_id AND status = 'draft'
  RETURNING * INTO v_ts;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Timesheet not found or not in draft status');
  END IF;

  RETURN jsonb_build_object('success', true, 'timesheet', to_jsonb(v_ts));
END;
$$;

GRANT EXECUTE ON FUNCTION approve_timesheet(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. RLS: Realtime uses same policies - workers see only own invites,
-- managers see only own venue timekeeping. Existing policies in earlier
-- migrations already enforce this. No new policies needed for Realtime.
-- (Worker sees shift_invites WHERE team_member_id IN own; Manager sees
-- timekeeping_records WHERE venue_id IN org venues.)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 6. GPS PROXIMITY: Optional - venues table has 'address' TEXT only.
-- To add distance validation, add column: ALTER TABLE venues ADD COLUMN location GEOGRAPHY(POINT);
-- Then in clock_in_with_validation check ST_Distance. Skipped here; clock_in_location stored as text.
-- -----------------------------------------------------------------------------
