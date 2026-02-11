-- ============================================
-- INVITATION SYSTEM ENHANCEMENTS (Protocol)
-- - Unique pending invite per email per org
-- - Org owner can create invites (create_invite RPC)
-- - Email verification on accept (accept_invite)
-- - Cleanup function for expired invites
-- ============================================

-- 1. Unique constraint: only one pending invite per email per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_org_email_pending
  ON public.invites (organisation_id, lower(email))
  WHERE status = 'pending';

-- 2. Update create_invite: allow org owner (owner_id) to create invites
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
  v_is_owner boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ORG OWNER: can invite (treat as 'employer' level)
  SELECT (o.owner_id = auth.uid()) INTO v_is_owner
  FROM organisations o
  WHERE o.id = p_organisation_id;

  IF v_is_owner THEN
    v_inviter_level := 'employer';
  ELSE
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

-- 3. Update accept_invite: validate email match (invite sent to X, user must register with X)
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
  v_user_email text;
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv
  FROM invites
  WHERE token = trim(p_token) AND status = 'pending' AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired or already used invite token';
  END IF;

  -- Email verification: invite was sent to v_inv.email, user must have that email
  SELECT au.email INTO v_user_email
  FROM auth.users au
  WHERE au.id = v_uid;

  IF v_user_email IS NULL THEN
    SELECT p.email INTO v_user_email FROM profiles p WHERE p.id = v_uid;
  END IF;

  IF v_user_email IS NULL OR lower(trim(v_user_email)) != lower(trim(v_inv.email)) THEN
    RAISE EXCEPTION 'This invitation was sent to % - you must sign in with that email address', v_inv.email;
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

  -- Notify inviter (new notifications schema: organisation_id, recipient_id, category, etc.)
  IF v_inv.invited_by IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'recipient_id') THEN
      INSERT INTO notifications (organisation_id, actor_id, recipient_id, category, event_type, title, body, priority)
      VALUES (
        v_inv.organisation_id,
        v_uid,
        v_inv.invited_by,
        'hierarchy',
        'invite_accepted',
        'Invitation accepted',
        COALESCE((SELECT full_name FROM profiles WHERE id = v_uid), v_inv.email) || ' accepted your invitation and joined as ' || v_inv.hierarchy_level,
        'normal'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'organisation_id', v_inv.organisation_id,
    'hierarchy_level', v_inv.hierarchy_level,
    'team_member_id', v_new_tm_id
  );
END;
$$;

-- 4. Cleanup function for expired invites (can be run by cron)
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invites
  SET status = 'expired'
  WHERE status = 'pending'
  AND expires_at < NOW();
END;
$$;

COMMENT ON FUNCTION cleanup_expired_invitations IS 'Marks expired pending invites as expired. Run via cron or manually.';
