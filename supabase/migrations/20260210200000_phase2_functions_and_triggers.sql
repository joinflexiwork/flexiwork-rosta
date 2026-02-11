-- ==========================================
-- FLEXIWORK PHASE 2: Függvények és triggerek
-- Minden függvény SECURITY DEFINER.
-- Kapcsolatok: profiles(id), organisations(id), team_members, venues.
-- ==========================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Segédfüggvény: hierarchia rangsor (1 = legmagasabb)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hierarchy_rank(level text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE level
    WHEN 'employer' THEN 1
    WHEN 'gm' THEN 2
    WHEN 'agm' THEN 3
    WHEN 'shift_leader' THEN 4
    WHEN 'worker' THEN 5
    ELSE 6
  END;
$$;

-- -----------------------------------------------------------------------------
-- 1. create_invite – meghívó létrehozás
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_invite(
  p_email text,
  p_organisation_id uuid,
  p_hierarchy_level text,
  p_venue_ids uuid[] DEFAULT '{}'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inviter_level text;
  v_token text;
  v_invite_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tm.hierarchy_level::text
  INTO v_inviter_level
  FROM team_members tm
  WHERE tm.user_id = auth.uid()
    AND tm.organisation_id = p_organisation_id
    AND tm.status = 'active'
  LIMIT 1;

  IF v_inviter_level IS NULL THEN
    RAISE EXCEPTION 'You are not an active member of this organisation';
  END IF;

  IF hierarchy_rank(v_inviter_level) >= hierarchy_rank(p_hierarchy_level) THEN
    RAISE EXCEPTION 'Your role (%) is not high enough to invite at level %', v_inviter_level, p_hierarchy_level;
  END IF;

  IF p_hierarchy_level NOT IN ('employer','gm','agm','shift_leader','worker') THEN
    RAISE EXCEPTION 'Invalid hierarchy_level: %', p_hierarchy_level;
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO invites (token, email, organisation_id, invited_by, hierarchy_level, venue_ids, status)
  VALUES (v_token, lower(trim(p_email)), p_organisation_id, auth.uid(), p_hierarchy_level, p_venue_ids, 'pending')
  RETURNING id INTO v_invite_id;

  RETURN v_token;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. accept_invite – meghívó elfogadás
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_invite(p_token text, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invites%ROWTYPE;
  v_new_tm_id uuid;
  v_inviter_tm_id uuid;
  v_uid uuid;
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv
  FROM invites
  WHERE token = p_token AND status = 'pending' AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired or already used invite token';
  END IF;

  IF EXISTS (
    SELECT 1 FROM team_members
    WHERE organisation_id = v_inv.organisation_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You are already a member of this organisation';
  END IF;

  INSERT INTO team_members (
    organisation_id, user_id, status, hierarchy_level, invited_by,
    employment_type, joined_at
  )
  VALUES (
    v_inv.organisation_id, v_uid, 'active',
    v_inv.hierarchy_level::hierarchy_level, v_inv.invited_by,
    'part_time', now()
  )
  RETURNING id INTO v_new_tm_id;

  INSERT INTO permissions (team_member_id, can_edit_rota, can_invite_workers, can_approve_timesheets)
  VALUES (
    v_new_tm_id,
    v_inv.hierarchy_level IN ('employer','gm','agm','shift_leader'),
    v_inv.hierarchy_level IN ('employer','gm','agm','shift_leader'),
    v_inv.hierarchy_level IN ('employer','gm','agm')
  )
  ON CONFLICT (team_member_id) DO UPDATE SET
    can_edit_rota = EXCLUDED.can_edit_rota,
    can_invite_workers = EXCLUDED.can_invite_workers,
    can_approve_timesheets = EXCLUDED.can_approve_timesheets;

  SELECT id INTO v_inviter_tm_id
  FROM team_members
  WHERE user_id = v_inv.invited_by AND organisation_id = v_inv.organisation_id AND status = 'active'
  LIMIT 1;

  IF v_inviter_tm_id IS NOT NULL THEN
    INSERT INTO management_chain (manager_id, subordinate_id, created_by)
    VALUES (v_inviter_tm_id, v_new_tm_id, v_inv.invited_by)
    ON CONFLICT (manager_id, subordinate_id) DO NOTHING;
  END IF;

  UPDATE invites
  SET status = 'accepted', accepted_by = v_uid, accepted_at = now()
  WHERE id = v_inv.id;

  IF v_inv.invited_by IS NOT NULL THEN
    PERFORM create_notification(
      v_inv.invited_by,
      'invite_accepted',
      'Meghívó elfogadva',
      'Valaki elfogadta a meghívásodat: ' || v_inv.email,
      jsonb_build_object('invite_id', v_inv.id, 'organisation_id', v_inv.organisation_id, 'accepted_by', v_uid),
      'normal'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'organisation_id', v_inv.organisation_id,
    'hierarchy_level', v_inv.hierarchy_level,
    'team_member_id', v_new_tm_id
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. check_permission – jogosultság ellenőrzés
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_permission(
  p_user_id uuid,
  p_permission_name text,
  p_venue_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_is_employer boolean;
  v_tm_id uuid;
  v_can boolean;
  v_has_venue boolean;
BEGIN
  SELECT tm.hierarchy_level = 'employer', tm.id
  INTO v_is_employer, v_tm_id
  FROM team_members tm
  WHERE tm.user_id = p_user_id AND tm.status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_is_employer THEN
    RETURN true;
  END IF;

  v_can := false;
  SELECT CASE p_permission_name
    WHEN 'can_edit_rota' THEN (SELECT per.can_edit_rota FROM permissions per WHERE per.team_member_id = v_tm_id)
    WHEN 'can_invite_managers' THEN (SELECT per.can_invite_managers FROM permissions per WHERE per.team_member_id = v_tm_id)
    WHEN 'can_invite_workers' THEN (SELECT per.can_invite_workers FROM permissions per WHERE per.team_member_id = v_tm_id)
    WHEN 'can_approve_timesheets' THEN (SELECT per.can_approve_timesheets FROM permissions per WHERE per.team_member_id = v_tm_id)
    WHEN 'can_view_cross_branch_analytics' THEN (SELECT per.can_view_cross_branch_analytics FROM permissions per WHERE per.team_member_id = v_tm_id)
    WHEN 'can_manage_venue_settings' THEN (SELECT per.can_manage_venue_settings FROM permissions per WHERE per.team_member_id = v_tm_id)
    ELSE false
  END INTO v_can;

  IF v_can IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF p_venue_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'team_members' AND column_name = 'venue_scope') THEN
      SELECT (venue_scope IS NULL OR array_length(venue_scope, 1) IS NULL OR p_venue_id = ANY(venue_scope))
      INTO v_has_venue FROM team_members WHERE id = v_tm_id;
    ELSE
      SELECT EXISTS (SELECT 1 FROM team_member_venues WHERE team_member_id = v_tm_id AND venue_id = p_venue_id)
      INTO v_has_venue;
    END IF;
    IF NOT COALESCE(v_has_venue, false) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. create_notification – értesítés létrehozás
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}',
  p_priority text DEFAULT 'normal'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref record;
  v_quiet_start time;
  v_quiet_end time;
  v_now time;
  v_skip_push boolean := false;
  v_id uuid;
BEGIN
  SELECT np.channels, np.quiet_hours_start, np.quiet_hours_end
  INTO v_pref
  FROM notification_preferences np
  WHERE np.user_id = p_user_id AND np.type = p_type
  LIMIT 1;

  IF FOUND AND v_pref.channels ? 'in_app' AND (v_pref.channels->>'in_app')::boolean = false THEN
    RETURN NULL;
  END IF;

  v_quiet_start := COALESCE(v_pref.quiet_hours_start, '22:00'::time);
  v_quiet_end := COALESCE(v_pref.quiet_hours_end, '08:00'::time);
  v_now := (now() AT TIME ZONE 'UTC')::time;
  IF v_quiet_start > v_quiet_end THEN
    v_skip_push := (v_now >= v_quiet_start OR v_now < v_quiet_end);
  ELSE
    v_skip_push := (v_now >= v_quiet_start AND v_now < v_quiet_end);
  END IF;

  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (p_user_id, p_type, p_title, p_message, p_metadata)
  RETURNING id INTO v_id;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'priority') THEN
    UPDATE notifications SET priority = p_priority WHERE id = v_id;
  END IF;

  PERFORM pg_notify(
    'notifications',
    json_build_object('user_id', p_user_id, 'id', v_id, 'type', p_type, 'skip_push', v_skip_push)::text
  );

  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. mark_notifications_read – olvasottá jelölés
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_notifications_read(p_notification_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'read_at') THEN
    UPDATE notifications SET read_at = now() WHERE id = ANY(p_notification_ids) AND user_id = auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'read') THEN
    UPDATE notifications SET read = true WHERE id = ANY(p_notification_ids) AND user_id = auth.uid();
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. get_subordinates – alárendeltek (rekurzív)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_subordinates(p_manager_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE sub AS (
    SELECT subordinate_id AS id FROM management_chain WHERE manager_id = p_manager_id
    UNION ALL
    SELECT mc.subordinate_id FROM management_chain mc JOIN sub s ON mc.manager_id = s.id
  )
  SELECT DISTINCT id FROM sub;
$$;

-- -----------------------------------------------------------------------------
-- TRIGGER: auto_create_permissions – új team_member → permissions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_create_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_edit boolean := false;
  v_can_invite_workers boolean := false;
  v_can_approve boolean := false;
BEGIN
  IF NEW.hierarchy_level IN ('employer','gm','agm','shift_leader') THEN
    v_can_edit := true;
    v_can_invite_workers := true;
  END IF;
  IF NEW.hierarchy_level IN ('employer','gm','agm') THEN
    v_can_approve := true;
  END IF;

  INSERT INTO permissions (team_member_id, can_edit_rota, can_invite_managers, can_invite_workers, can_approve_timesheets)
  VALUES (NEW.id, v_can_edit, NEW.hierarchy_level IN ('employer','gm'), v_can_invite_workers, v_can_approve)
  ON CONFLICT (team_member_id) DO UPDATE SET
    can_edit_rota = EXCLUDED.can_edit_rota,
    can_invite_workers = EXCLUDED.can_invite_workers,
    can_approve_timesheets = EXCLUDED.can_approve_timesheets;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_permissions ON team_members;
CREATE TRIGGER trigger_auto_create_permissions
  AFTER INSERT ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_permissions();

-- -----------------------------------------------------------------------------
-- TRIGGER: log_hierarchy_change – hierarchy_level változás → értesítés
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_hierarchy_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.hierarchy_level IS DISTINCT FROM NEW.hierarchy_level AND NEW.user_id IS NOT NULL THEN
    PERFORM create_notification(
      NEW.user_id,
      'hierarchy_change',
      'Pozíció változás',
      'Pozíció változás: ' || COALESCE(OLD.hierarchy_level::text, '?') || ' → ' || COALESCE(NEW.hierarchy_level::text, '?'),
      jsonb_build_object('old_level', OLD.hierarchy_level::text, 'new_level', NEW.hierarchy_level::text, 'team_member_id', NEW.id),
      'normal'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_hierarchy_change ON team_members;
CREATE TRIGGER trigger_log_hierarchy_change
  AFTER UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION log_hierarchy_change();

-- -----------------------------------------------------------------------------
-- TRIGGER: init_notification_prefs – új user → alap notification beállítások
-- (profiles AFTER INSERT, mert profiles(id) a FK; auth.users után a profile létezik)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION init_notification_prefs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id, type, channels)
  VALUES
    (NEW.id, 'invite_accepted', '{"email": true, "push": true, "in_app": true}'::jsonb),
    (NEW.id, 'hierarchy_change', '{"email": true, "push": true, "in_app": true}'::jsonb),
    (NEW.id, 'shift_accepted', '{"email": true, "push": true, "in_app": true}'::jsonb),
    (NEW.id, 'general', '{"email": true, "push": true, "in_app": true}'::jsonb)
  ON CONFLICT (user_id, type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_init_notification_prefs ON profiles;
CREATE TRIGGER trigger_init_notification_prefs
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION init_notification_prefs();

COMMIT;
