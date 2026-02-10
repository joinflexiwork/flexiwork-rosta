-- Ensure accept_shift_invite_atomic exists (fix 404 on shift acceptance).
-- Uses same signature as client: p_invite_id, p_team_member_id.
-- SECURITY DEFINER so the function can run even if caller RLS would block reads.

CREATE OR REPLACE FUNCTION accept_shift_invite_atomic(
  p_invite_id UUID,
  p_team_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
    RETURN jsonb_build_object('success', false, 'error', 'Invite not found');
  END IF;

  IF v_invite.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This shift has already been filled or declined');
  END IF;

  IF v_invite.team_member_id != p_team_member_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite does not belong to this team member');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE id = p_team_member_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to accept this invite');
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    UPDATE shift_invites SET status = 'expired', responded_at = NOW() WHERE id = p_invite_id;
    RETURN jsonb_build_object('success', false, 'error', 'Invite has expired');
  END IF;

  SELECT headcount_needed INTO v_shift FROM rota_shifts WHERE id = v_invite.rota_shift_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Shift not found');
  END IF;

  SELECT COUNT(*)::INT INTO v_filled
  FROM shift_allocations
  WHERE rota_shift_id = v_invite.rota_shift_id;

  IF v_filled >= COALESCE(v_shift.headcount_needed, 1) THEN
    UPDATE shift_invites SET status = 'expired', responded_at = NOW() WHERE id = p_invite_id;
    RETURN jsonb_build_object('success', false, 'error', 'This shift has been filled by another employee');
  END IF;

  INSERT INTO shift_allocations (
    rota_shift_id,
    team_member_id,
    allocation_type,
    status,
    allocated_by
  ) VALUES (
    v_invite.rota_shift_id,
    p_team_member_id,
    'accepted',
    'confirmed',
    auth.uid()
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

  RETURN jsonb_build_object('success', true, 'allocation', to_jsonb(v_allocation));
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION accept_shift_invite_atomic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_shift_invite_atomic(UUID, UUID) TO service_role;
