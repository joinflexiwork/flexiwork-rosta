-- Fix 500 on team_members: break organisations <-> team_members RLS recursion.
-- "Managers can view their org" on organisations did SELECT from team_members;
-- "Employers can view team" on team_members did SELECT from organisations -> infinite loop.
-- Use a SECURITY DEFINER function so org visibility is computed without triggering RLS.

-- 1. Helper: return org ids the user can manage (owner or manager). Runs as definer, no RLS.
CREATE OR REPLACE FUNCTION get_org_ids_manageable_by_user(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM organisations WHERE owner_id = uid
  UNION
  SELECT organisation_id FROM team_members
  WHERE user_id = uid AND member_type = 'manager' AND status = 'active';
$$;

-- 2. Replace organisations SELECT with a single policy using the helper (no team_members in policy expression)
DROP POLICY IF EXISTS "Allow owners to view their org" ON organisations;
DROP POLICY IF EXISTS "Managers can view their org" ON organisations;

CREATE POLICY "Users can view orgs they own or manage"
  ON organisations FOR SELECT TO authenticated
  USING (id IN (SELECT get_org_ids_manageable_by_user(auth.uid())));

-- 3. team_members: keep simple policies; ensure "Employees can view self" exists (user_id = auth.uid())
--    and employers use organisations only (no change needed if already organisation_id IN (SELECT id FROM organisations...))
--    Now that organisations is read via the function, no recursion.

-- 4. (Safe mode) Drop the "allocated shift" policies that add heavy subqueries; re-add later when stable.
DROP POLICY IF EXISTS "Employees can view shifts they are allocated to" ON rota_shifts;
DROP POLICY IF EXISTS "Employees can view venues of their allocated shifts" ON venues;
DROP POLICY IF EXISTS "Employees can view roles of their allocated shifts" ON roles;
DROP POLICY IF EXISTS "Employees can view orgs of their allocated shifts" ON organisations;

-- 5. Harden notify_shift_accepted: NULL checks and don't fail the insert if notification fails
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
  IF NEW.allocation_type IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;
  IF NEW.rota_shift_id IS NULL OR NEW.team_member_id IS NULL THEN
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
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;
