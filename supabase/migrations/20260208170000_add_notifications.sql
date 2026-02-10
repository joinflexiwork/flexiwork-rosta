-- Notifications table for employer alerts (e.g. shift accepted).
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE
  USING (user_id = auth.uid());
-- Trigger (SECURITY DEFINER) inserts shift_accepted; restrict so only that type can be inserted by non-owner
CREATE POLICY "Allow insert shift_accepted notifications" ON notifications FOR INSERT
  WITH CHECK (type = 'shift_accepted');

-- Notify org owner when a worker accepts a shift (trigger on shift_allocations).
CREATE OR REPLACE FUNCTION notify_shift_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_worker_name TEXT;
  v_role_name TEXT;
  v_shift_date DATE;
  v_title TEXT := 'Shift Filled';
  v_message TEXT;
BEGIN
  -- Only when allocation is from an invite (type 'accepted'); direct allocations don't need notify
  IF NEW.allocation_type != 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT o.owner_id, rs.shift_date
  INTO v_owner_id, v_shift_date
  FROM rota_shifts rs
  JOIN venues v ON v.id = rs.venue_id
  JOIN organisations o ON o.id = v.organisation_id
  WHERE rs.id = NEW.rota_shift_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.full_name INTO v_worker_name
  FROM team_members tm
  JOIN profiles p ON p.id = tm.user_id
  WHERE tm.id = NEW.team_member_id;

  SELECT r.name INTO v_role_name
  FROM rota_shifts rs
  JOIN roles r ON r.id = rs.role_id
  WHERE rs.id = NEW.rota_shift_id;

  v_worker_name := COALESCE(TRIM(v_worker_name), 'A worker');
  v_role_name := COALESCE(TRIM(v_role_name), 'shift');
  v_message := v_worker_name || ' accepted the ' || v_role_name || ' shift on ' || COALESCE(v_shift_date::TEXT, '') || '.';

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    v_owner_id,
    'shift_accepted',
    v_title,
    v_message,
    jsonb_build_object(
      'rota_shift_id', NEW.rota_shift_id,
      'allocation_id', NEW.id,
      'team_member_id', NEW.team_member_id,
      'shift_date', v_shift_date,
      'role_name', v_role_name
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_shift_accepted ON shift_allocations;
CREATE TRIGGER trigger_notify_shift_accepted
  AFTER INSERT ON shift_allocations
  FOR EACH ROW
  EXECUTE FUNCTION notify_shift_accepted();
