-- Manual time entry and approval workflow (PART 1: Schema)
-- Extend timekeeping_records and add shift_time_approvals.
-- Run after 20260209150000_manual_clock_approval_workflow.sql

-- 1. Extend timekeeping_records with submitted/actual times and approval flow
ALTER TABLE timekeeping_records
  ADD COLUMN IF NOT EXISTS submitted_start_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS submitted_end_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Allow manual_entry_status to include 'auto_clocked' (for Option A: Clock In Now)
ALTER TABLE timekeeping_records
  DROP CONSTRAINT IF EXISTS timekeeping_records_manual_entry_status_check;

ALTER TABLE timekeeping_records
  ADD CONSTRAINT timekeeping_records_manual_entry_status_check
  CHECK (manual_entry_status IS NULL OR manual_entry_status IN (
    'draft', 'pending', 'approved', 'rejected', 'modified', 'auto_clocked'
  ));

-- 2. shift_time_approvals table
CREATE TABLE IF NOT EXISTS shift_time_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timekeeping_record_id UUID NOT NULL REFERENCES timekeeping_records(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  original_shift_start TIMESTAMP WITH TIME ZONE,
  original_shift_end TIMESTAMP WITH TIME ZONE,
  requested_start TIMESTAMP WITH TIME ZONE NOT NULL,
  requested_end TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'modified')),
  manager_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_time_approvals_record ON shift_time_approvals(timekeeping_record_id);
CREATE INDEX IF NOT EXISTS idx_shift_time_approvals_status ON shift_time_approvals(status);
CREATE INDEX IF NOT EXISTS idx_shift_time_approvals_submitted_by ON shift_time_approvals(submitted_by);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_shift_time_approvals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_shift_time_approvals_updated ON shift_time_approvals;
CREATE TRIGGER trigger_shift_time_approvals_updated
  BEFORE UPDATE ON shift_time_approvals
  FOR EACH ROW EXECUTE PROCEDURE set_shift_time_approvals_updated_at();

-- 3. RLS for shift_time_approvals
ALTER TABLE shift_time_approvals ENABLE ROW LEVEL SECURITY;

-- Workers can see their own submissions
CREATE POLICY "Workers can view own shift_time_approvals"
  ON shift_time_approvals FOR SELECT
  USING (submitted_by IN (SELECT id FROM team_members WHERE user_id = auth.uid()));

-- Managers can view approvals for their org's timekeeping (via venue -> org)
CREATE POLICY "Managers can view org shift_time_approvals"
  ON shift_time_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM timekeeping_records tk
      JOIN venues v ON v.id = tk.venue_id
      JOIN organisations o ON o.id = v.organisation_id
      WHERE tk.id = shift_time_approvals.timekeeping_record_id
        AND o.owner_id = auth.uid()
    )
  );

-- Only service/RPC can insert/update (managers update via RPC)
CREATE POLICY "Service insert shift_time_approvals"
  ON shift_time_approvals FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update shift_time_approvals"
  ON shift_time_approvals FOR UPDATE USING (true) WITH CHECK (true);

-- 4. RPC: submit_manual_time_entry
-- Worker submits manual start/end for approval. Creates or updates timekeeping_record and shift_time_approvals.
-- Validates: within 24h of scheduled shift; no duplicate clock-in for same shift.
CREATE OR REPLACE FUNCTION submit_manual_time_entry(
  p_rota_shift_id UUID,
  p_team_member_id UUID,
  p_requested_start TIMESTAMP WITH TIME ZONE,
  p_requested_end TIMESTAMP WITH TIME ZONE,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id UUID;
  v_shift_start TIMESTAMP WITH TIME ZONE;
  v_shift_end TIMESTAMP WITH TIME ZONE;
  v_shift_date DATE;
  v_record_id UUID;
  v_approval_id UUID;
  v_manager_id UUID;
  v_existing_id UUID;
  v_existing_status TEXT;
BEGIN
  IF p_requested_start >= p_requested_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'Start time must be before end time');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM shift_allocations
    WHERE rota_shift_id = p_rota_shift_id AND team_member_id = p_team_member_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allocated to this shift');
  END IF;

  SELECT rs.venue_id, rs.shift_date, rs.start_time, rs.end_time
  INTO v_venue_id, v_shift_date, v_shift_start, v_shift_end
  FROM rota_shifts rs
  WHERE rs.id = p_rota_shift_id;

  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Shift not found');
  END IF;

  v_shift_start := (v_shift_date::TIMESTAMP + COALESCE(v_shift_start::INTERVAL, INTERVAL '0'));
  v_shift_end := (v_shift_date::TIMESTAMP + COALESCE(v_shift_end::INTERVAL, INTERVAL '0'));

  -- Within 24h of scheduled shift
  IF p_requested_start < v_shift_start - INTERVAL '24 hours' OR p_requested_start > v_shift_end + INTERVAL '24 hours' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submitted time must be within 24 hours of scheduled shift');
  END IF;

  SELECT id, manual_entry_status INTO v_existing_id, v_existing_status
  FROM timekeeping_records
  WHERE rota_shift_id = p_rota_shift_id AND team_member_id = p_team_member_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL AND v_existing_status = 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have a pending submission for this shift');
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE timekeeping_records
    SET
      submitted_start_time = p_requested_start,
      submitted_end_time = p_requested_end,
      actual_start_time = NULL,
      actual_end_time = NULL,
      reason = p_reason,
      manual_entry_status = 'pending',
      submitted_at = NOW(),
      proposed_clock_in = p_requested_start,
      proposed_clock_out = p_requested_end,
      modification_reason = p_reason
    WHERE id = v_existing_id
    RETURNING id INTO v_record_id;
  ELSE
    INSERT INTO timekeeping_records (
      rota_shift_id, team_member_id, venue_id,
      submitted_start_time, submitted_end_time,
      reason, manual_entry_status, submitted_at,
      proposed_clock_in, proposed_clock_out, modification_reason
    ) VALUES (
      p_rota_shift_id, p_team_member_id, v_venue_id,
      p_requested_start, p_requested_end,
      p_reason, 'pending', NOW(),
      p_requested_start, p_requested_end, p_reason
    )
    RETURNING id INTO v_record_id;
  END IF;

  INSERT INTO shift_time_approvals (
    timekeeping_record_id, submitted_by, original_shift_start, original_shift_end,
    requested_start, requested_end, reason, status
  ) VALUES (
    v_record_id, p_team_member_id, v_shift_start, v_shift_end,
    p_requested_start, p_requested_end, p_reason, 'pending'
  )
  RETURNING id INTO v_approval_id;

  SELECT o.owner_id INTO v_manager_id
  FROM rota_shifts rs
  JOIN venues v ON v.id = rs.venue_id
  JOIN organisations o ON o.id = v.organisation_id
  WHERE rs.id = p_rota_shift_id;

  IF v_manager_id IS NOT NULL THEN
    INSERT INTO shift_notifications (recipient_id, sender_id, type, title, message, data)
    VALUES (
      v_manager_id,
      (SELECT user_id FROM team_members WHERE id = p_team_member_id),
      'time_submitted',
      'Worker submitted time for review',
      'A worker has submitted clock-in/out times for approval',
      jsonb_build_object('shift_id', p_rota_shift_id, 'timekeeping_id', v_record_id, 'approval_id', v_approval_id)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'record_id', v_record_id, 'approval_id', v_approval_id);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_manual_time_entry(UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT) TO authenticated;

-- 5. RPC: process_time_approval (approve / reject / modify)
CREATE OR REPLACE FUNCTION process_time_approval(
  p_approval_id UUID,
  p_action VARCHAR(20),
  p_actual_start TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_actual_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_manager_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval RECORD;
  v_worker_user_id UUID;
  v_final_start TIMESTAMP WITH TIME ZONE;
  v_final_end TIMESTAMP WITH TIME ZONE;
  v_total_hrs DECIMAL(10,4);
  v_notif_type VARCHAR(50);
  v_notif_title TEXT;
BEGIN
  SELECT sta.*, tk.team_member_id
  INTO v_approval
  FROM shift_time_approvals sta
  JOIN timekeeping_records tk ON tk.id = sta.timekeeping_record_id
  WHERE sta.id = p_approval_id AND sta.status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approval not found or not pending');
  END IF;

  SELECT user_id INTO v_worker_user_id FROM team_members WHERE id = v_approval.team_member_id;

  IF p_action = 'approve' THEN
    v_final_start := COALESCE(p_actual_start, v_approval.requested_start);
    v_final_end := COALESCE(p_actual_end, v_approval.requested_end);
    v_notif_type := 'time_approved';
    v_notif_title := 'Your time has been approved';
  ELSIF p_action = 'reject' THEN
    IF p_manager_notes IS NULL OR trim(p_manager_notes) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Manager notes are required when rejecting');
    END IF;
    v_final_start := NULL;
    v_final_end := NULL;
    v_notif_type := 'time_rejected';
    v_notif_title := 'Your time submission was rejected';
  ELSIF p_action = 'modify' THEN
    IF p_actual_start IS NULL OR p_actual_end IS NULL OR p_actual_start >= p_actual_end THEN
      RETURN jsonb_build_object('success', false, 'error', 'Valid start and end times required for modify');
    END IF;
    v_final_start := p_actual_start;
    v_final_end := p_actual_end;
    v_notif_type := 'time_modified';
    v_notif_title := 'Your time has been modified';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  v_total_hrs := NULL;
  IF v_final_start IS NOT NULL AND v_final_end IS NOT NULL THEN
    v_total_hrs := EXTRACT(EPOCH FROM (v_final_end - v_final_start)) / 3600.0;
  END IF;

  UPDATE shift_time_approvals
  SET status = CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' WHEN 'modify' THEN 'modified' ELSE p_action END,
      manager_notes = p_manager_notes, updated_at = NOW()
  WHERE id = p_approval_id;

  UPDATE timekeeping_records
  SET
    manual_entry_status = CASE p_action WHEN 'reject' THEN 'rejected' ELSE 'approved' END,
    actual_start_time = v_final_start,
    actual_end_time = v_final_end,
    actual_clock_in = v_final_start,
    actual_clock_out = v_final_end,
    clock_in = v_final_start,
    clock_out = v_final_end,
    total_hours = v_total_hrs,
    reviewed_at = NOW(),
    reviewer_notes = p_manager_notes,
    reviewed_by = (SELECT id FROM team_members WHERE user_id = auth.uid() LIMIT 1)
  WHERE id = v_approval.timekeeping_record_id;

  INSERT INTO shift_notifications (recipient_id, sender_id, type, title, message, data)
  VALUES (
    v_worker_user_id,
    auth.uid(),
    v_notif_type,
    v_notif_title,
    p_manager_notes,
    jsonb_build_object('timekeeping_id', v_approval.timekeeping_record_id, 'approval_id', p_approval_id)
  );

  RETURN jsonb_build_object('success', true, 'status', p_action);
END;
$$;
GRANT EXECUTE ON FUNCTION process_time_approval(UUID, VARCHAR, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT) TO authenticated;

-- 6. RPC: clock_in_auto (Option A - Clock In Now, no approval needed, status auto_clocked)
CREATE OR REPLACE FUNCTION clock_in_auto(
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
    RETURN jsonb_build_object('success', false, 'error', 'Already clocked in for this shift');
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
    clock_in, clock_in_location, clock_in_method, status, approval_status, manual_entry_status
  ) VALUES (
    p_shift_id, p_team_member_id, v_shift.venue_id,
    NOW(), p_location, CASE WHEN p_location IS NOT NULL AND trim(p_location) != '' THEN 'gps' ELSE 'manual' END, 'pending', 'pending', 'auto_clocked'
  )
  RETURNING * INTO v_rec;

  UPDATE shift_allocations
  SET status = 'in_progress'
  WHERE rota_shift_id = p_shift_id AND team_member_id = p_team_member_id;

  RETURN jsonb_build_object('success', true, 'record', to_jsonb(v_rec));
END;
$$;
GRANT EXECUTE ON FUNCTION clock_in_auto(UUID, UUID, TEXT) TO authenticated;
