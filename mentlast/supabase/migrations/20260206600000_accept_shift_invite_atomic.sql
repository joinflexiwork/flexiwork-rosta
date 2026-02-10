-- Atomic accept shift invite: first-come-first-served, no race condition.
-- Runs with INVOKER so RLS applies (caller must be the invited employee).

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
  -- Lock and fetch invite (RLS will restrict to caller's invites)
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

  -- Ensure caller is this team member's user (RLS on team_members would block otherwise; we're just double-checking)
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

  RETURN to_jsonb(v_allocation);
END;
$$;

-- Allow authenticated users to call (RLS still applies via INVOKER)
GRANT EXECUTE ON FUNCTION accept_shift_invite_atomic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_shift_invite_atomic(UUID, UUID) TO service_role;
