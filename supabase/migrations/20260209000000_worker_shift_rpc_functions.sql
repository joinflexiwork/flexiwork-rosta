-- =============================================================================
-- Worker shift visibility via RPC (no RLS changes). SECURITY DEFINER bypasses
-- RLS so workers get full shift details without recursion. Ownership enforced
-- inside functions via team_members.user_id.
-- =============================================================================

-- 1. get_worker_shifts(p_user_id UUID) — all shifts allocated to this user with full details
CREATE OR REPLACE FUNCTION get_worker_shifts(p_user_id UUID)
RETURNS TABLE (
  shift_allocation_id UUID,
  rota_shift_id UUID,
  status TEXT,
  venue_id UUID,
  venue_name TEXT,
  venue_address TEXT,
  role_id UUID,
  role_name TEXT,
  shift_date DATE,
  shift_start_time TIME,
  shift_end_time TIME,
  allocated_by_user_id UUID,
  allocated_at TIMESTAMP WITH TIME ZONE,
  organisation_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    sa.id AS shift_allocation_id,
    sa.rota_shift_id,
    sa.status,
    v.id AS venue_id,
    v.name AS venue_name,
    v.address AS venue_address,
    r.id AS role_id,
    r.name AS role_name,
    rs.shift_date,
    rs.start_time AS shift_start_time,
    rs.end_time AS shift_end_time,
    sa.allocated_by AS allocated_by_user_id,
    sa.allocated_at,
    o.name AS organisation_name
  FROM shift_allocations sa
  JOIN team_members tm ON tm.id = sa.team_member_id AND tm.user_id = p_user_id
  JOIN rota_shifts rs ON rs.id = sa.rota_shift_id
  JOIN venues v ON v.id = rs.venue_id
  LEFT JOIN roles r ON r.id = rs.role_id
  LEFT JOIN organisations o ON o.id = v.organisation_id
  WHERE sa.status IN ('allocated', 'confirmed', 'in_progress', 'completed')
  ORDER BY rs.shift_date, rs.start_time;
$$;

-- 2. get_worker_shift_details(p_allocation_id UUID) — single shift; only if allocation belongs to auth.uid()
CREATE OR REPLACE FUNCTION get_worker_shift_details(p_allocation_id UUID)
RETURNS TABLE (
  shift_allocation_id UUID,
  rota_shift_id UUID,
  status TEXT,
  venue_id UUID,
  venue_name TEXT,
  venue_address TEXT,
  role_id UUID,
  role_name TEXT,
  shift_date DATE,
  shift_start_time TIME,
  shift_end_time TIME,
  allocated_by_user_id UUID,
  allocated_at TIMESTAMP WITH TIME ZONE,
  organisation_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    sa.id AS shift_allocation_id,
    sa.rota_shift_id,
    sa.status,
    v.id AS venue_id,
    v.name AS venue_name,
    v.address AS venue_address,
    r.id AS role_id,
    r.name AS role_name,
    rs.shift_date,
    rs.start_time AS shift_start_time,
    rs.end_time AS shift_end_time,
    sa.allocated_by AS allocated_by_user_id,
    sa.allocated_at,
    o.name AS organisation_name
  FROM shift_allocations sa
  JOIN team_members tm ON tm.id = sa.team_member_id AND tm.user_id = auth.uid()
  JOIN rota_shifts rs ON rs.id = sa.rota_shift_id
  JOIN venues v ON v.id = rs.venue_id
  LEFT JOIN roles r ON r.id = rs.role_id
  LEFT JOIN organisations o ON o.id = v.organisation_id
  WHERE sa.id = p_allocation_id;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION get_worker_shifts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_worker_shift_details(UUID) TO authenticated;
