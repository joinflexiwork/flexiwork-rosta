-- ============================================
-- INTELLIGENT NOTIFICATION SYSTEM SCHEMA
-- Renames legacy tables, creates new hierarchy-aware schema
-- ============================================

-- 0. Rename legacy tables (preserve data, no delete)
ALTER TABLE IF EXISTS public.notifications RENAME TO notifications_legacy;
ALTER TABLE IF EXISTS public.notification_preferences RENAME TO notification_preferences_legacy;

-- 1. Notifications table (Central event store)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  category VARCHAR(50) NOT NULL CHECK (category IN ('hierarchy', 'shift', 'approval', 'system')),
  event_type VARCHAR(50) NOT NULL,

  title TEXT NOT NULL,
  body TEXT NOT NULL,

  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  action_link TEXT,

  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON public.notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org_category ON public.notifications(organisation_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread_count ON public.notifications(recipient_id, is_read) WHERE is_read = false;

-- 2. Notification Preferences (User settings per category per org)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,

  hierarchy_changes JSONB NOT NULL DEFAULT '{"in_app": true, "email": true, "push": true}',
  shift_changes JSONB NOT NULL DEFAULT '{"in_app": true, "email": false, "push": true}',
  approvals JSONB NOT NULL DEFAULT '{"in_app": true, "email": true, "push": false}',
  system_alerts JSONB NOT NULL DEFAULT '{"in_app": true, "email": true, "push": false}',

  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT DEFAULT 'Europe/Budapest',

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT notification_preferences_profile_org_unique UNIQUE (profile_id, organisation_id)
);

-- 3. RLS Policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own preferences" ON public.notification_preferences;
CREATE POLICY "Users manage own preferences" ON public.notification_preferences
  FOR ALL USING (profile_id = auth.uid());

-- 4. Update notify_shift_accepted trigger for new schema
CREATE OR REPLACE FUNCTION notify_shift_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_organisation_id UUID;
  v_worker_name TEXT;
  v_role_name TEXT;
  v_shift_date DATE;
  v_title TEXT := 'Shift Filled';
  v_body TEXT;
BEGIN
  IF NEW.allocation_type != 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT o.owner_id, o.id, rs.shift_date
  INTO v_owner_id, v_organisation_id, v_shift_date
  FROM rota_shifts rs
  JOIN venues v ON v.id = rs.venue_id
  JOIN organisations o ON o.id = v.organisation_id
  WHERE rs.id = NEW.rota_shift_id;

  IF v_owner_id IS NULL OR v_organisation_id IS NULL THEN
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
  v_body := v_worker_name || ' accepted the ' || v_role_name || ' shift on ' || COALESCE(v_shift_date::TEXT, '') || '.';

  INSERT INTO notifications (
    organisation_id, actor_id, recipient_id, category, event_type, title, body, priority
  ) VALUES (
    v_organisation_id,
    NULL,
    v_owner_id,
    'shift',
    'shift_accepted',
    v_title,
    v_body,
    'normal'
  );

  RETURN NEW;
END;
$$;

-- Trigger already exists from 20260208170000
DROP TRIGGER IF EXISTS trigger_notify_shift_accepted ON shift_allocations;
CREATE TRIGGER trigger_notify_shift_accepted
  AFTER INSERT ON shift_allocations
  FOR EACH ROW
  EXECUTE FUNCTION notify_shift_accepted();

COMMENT ON TABLE public.notifications IS 'Central notification store for all system events';
COMMENT ON TABLE public.notification_preferences IS 'User notification channel preferences per category';
