-- Manual clock-in/clock-out with approval workflow and notifications
-- Run after clock_and_timekeeping_fixes

-- 1. Add columns to timekeeping_records for proposed/actual times and workflow
ALTER TABLE timekeeping_records
  ADD COLUMN IF NOT EXISTS proposed_clock_in TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS proposed_clock_out TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS actual_clock_in TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS actual_clock_out TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS manual_entry_status VARCHAR(50) DEFAULT NULL
    CHECK (manual_entry_status IS NULL OR manual_entry_status IN ('draft', 'pending', 'approved', 'rejected', 'modified')),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS reviewer_notes TEXT,
  ADD COLUMN IF NOT EXISTS modification_reason TEXT,
  ADD COLUMN IF NOT EXISTS original_shift_start TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS original_shift_end TIMESTAMP WITH TIME ZONE;

-- 2. shift_notifications table (recipient = auth user id)
CREATE TABLE IF NOT EXISTS shift_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  title TEXT,
  message TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_notifications_recipient ON shift_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_shift_notifications_is_read ON shift_notifications(recipient_id, is_read) WHERE is_read = false;

ALTER TABLE shift_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see own shift notifications" ON shift_notifications;
CREATE POLICY "Users can see own shift notifications" ON shift_notifications
  FOR SELECT USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own shift notifications read" ON shift_notifications;
CREATE POLICY "Users can update own shift notifications read" ON shift_notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Service can insert shift notifications" ON shift_notifications;
CREATE POLICY "Service can insert shift notifications" ON shift_notifications
  FOR INSERT WITH CHECK (true);

-- 3. submit_time_proposal: worker submits proposed clock in/out for approval
CREATE OR REPLACE FUNCTION submit_time_proposal(
  p_shift_id UUID,
  p_team_member_id UUID,
  p_clock_in TIMESTAMP WITH TIME ZONE,
  p_clock_out TIMESTAMP WITH TIME ZONE,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id UUID;
  v_manager_id UUID;
  v_venue_id UUID;
  v_existing_id UUID;
BEGIN
  IF p_clock_in >= p_clock_out THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clock-in must be before clock-out');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM shift_allocations
    WHERE rota_shift_id = p_shift_id AND team_member_id = p_team_member_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allocated to shift');
  END IF;

  SELECT rs.venue_id INTO v_venue_id FROM rota_shifts rs WHERE rs.id = p_shift_id;
  IF v_venue_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Shift not found');
  END IF;

  SELECT id INTO v_existing_id FROM timekeeping_records
  WHERE rota_shift_id = p_shift_id AND team_member_id = p_team_member_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE timekeeping_records
    SET
      proposed_clock_in = p_clock_in,
      proposed_clock_out = p_clock_out,
      manual_entry_status = 'pending',
      submitted_at = NOW(),
      modification_reason = p_reason
    WHERE id = v_existing_id
    RETURNING id INTO v_record_id;
  ELSE
    INSERT INTO timekeeping_records (
      rota_shift_id, team_member_id, venue_id,
      proposed_clock_in, proposed_clock_out,
      manual_entry_status, submitted_at, modification_reason
    ) VALUES (
      p_shift_id, p_team_member_id, v_venue_id,
      p_clock_in, p_clock_out,
      'pending', NOW(), p_reason
    )
    RETURNING id INTO v_record_id;
  END IF;

  SELECT o.owner_id INTO v_manager_id
  FROM rota_shifts rs
  JOIN venues v ON v.id = rs.venue_id
  JOIN organisations o ON o.id = v.organisation_id
  WHERE rs.id = p_shift_id;

  IF v_manager_id IS NOT NULL THEN
    INSERT INTO shift_notifications (recipient_id, sender_id, type, title, message, data)
    VALUES (
      v_manager_id,
      (SELECT user_id FROM team_members WHERE id = p_team_member_id),
      'time_submitted',
      'Worker submitted time for review',
      'A worker has submitted clock-in/out times for approval',
      jsonb_build_object('shift_id', p_shift_id, 'timekeeping_id', v_record_id)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'record_id', v_record_id);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_time_proposal(UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT) TO authenticated;

-- 4. review_time_proposal: manager approves, rejects, or modifies
CREATE OR REPLACE FUNCTION review_time_proposal(
  p_timekeeping_id UUID,
  p_action VARCHAR(20),
  p_actual_clock_in TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_actual_clock_out TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_worker_user_id UUID;
  v_final_clock_in TIMESTAMP WITH TIME ZONE;
  v_final_clock_out TIMESTAMP WITH TIME ZONE;
  v_status VARCHAR(20);
  v_notif_type VARCHAR(50);
  v_notif_title TEXT;
  v_total_hrs DECIMAL(10,4);
BEGIN
  SELECT team_member_id, rota_shift_id, proposed_clock_in, proposed_clock_out
  INTO v_rec
  FROM timekeeping_records
  WHERE id = p_timekeeping_id AND manual_entry_status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Record not found or not pending');
  END IF;

  SELECT user_id INTO v_worker_user_id FROM team_members WHERE id = v_rec.team_member_id;

  IF p_action = 'approve' THEN
    v_status := 'approved';
    v_final_clock_in := COALESCE(p_actual_clock_in, v_rec.proposed_clock_in);
    v_final_clock_out := COALESCE(p_actual_clock_out, v_rec.proposed_clock_out);
    v_notif_type := 'time_approved';
    v_notif_title := 'Your time has been approved';
  ELSIF p_action = 'reject' THEN
    v_status := 'rejected';
    v_final_clock_in := NULL;
    v_final_clock_out := NULL;
    v_notif_type := 'time_rejected';
    v_notif_title := 'Your time submission was rejected';
  ELSIF p_action = 'modify' THEN
    v_status := 'modified';
    v_final_clock_in := p_actual_clock_in;
    v_final_clock_out := p_actual_clock_out;
    v_notif_type := 'time_modified';
    v_notif_title := 'Your time has been modified';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  IF v_status IN ('approved', 'modified') AND (v_final_clock_in IS NULL OR v_final_clock_out IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clock-in and clock-out required for approve/modify');
  END IF;

  IF v_status IN ('approved', 'modified') AND v_final_clock_in >= v_final_clock_out THEN
    RETURN jsonb_build_object('success', false, 'error', 'Clock-in must be before clock-out');
  END IF;

  v_total_hrs := NULL;
  IF v_final_clock_in IS NOT NULL AND v_final_clock_out IS NOT NULL THEN
    v_total_hrs := EXTRACT(EPOCH FROM (v_final_clock_out - v_final_clock_in)) / 3600.0;
  END IF;

  UPDATE timekeeping_records
  SET
    manual_entry_status = v_status,
    actual_clock_in = v_final_clock_in,
    actual_clock_out = v_final_clock_out,
    clock_in = v_final_clock_in,
    clock_out = v_final_clock_out,
    total_hours = v_total_hrs,
    reviewed_at = NOW(),
    reviewer_notes = p_notes,
    approval_status = CASE WHEN v_status = 'approved' THEN 'approved' WHEN v_status = 'rejected' THEN 'rejected' ELSE approval_status END
  WHERE id = p_timekeeping_id;

  INSERT INTO shift_notifications (recipient_id, sender_id, type, title, message, data)
  VALUES (
    v_worker_user_id,
    auth.uid(),
    v_notif_type,
    v_notif_title,
    p_notes,
    jsonb_build_object('timekeeping_id', p_timekeeping_id, 'shift_id', v_rec.rota_shift_id)
  );

  RETURN jsonb_build_object('success', true, 'status', v_status);
END;
$$;

GRANT EXECUTE ON FUNCTION review_time_proposal(UUID, VARCHAR, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT) TO authenticated;
