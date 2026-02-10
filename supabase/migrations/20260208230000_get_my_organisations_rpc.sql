-- Emergency fallback: RPC that returns organisations for the current user (owner or manager).
-- Runs as SECURITY DEFINER so it can read organisations/team_members even if RLS blocks the direct query.
-- Use when getMyOrganisations() returns empty but the user should see their org.

CREATE OR REPLACE FUNCTION get_my_organisations_rpc()
RETURNS SETOF organisations
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT o.* FROM organisations o
  WHERE o.owner_id = auth.uid()
  UNION
  SELECT o.* FROM organisations o
  INNER JOIN team_members tm ON tm.organisation_id = o.id
  WHERE tm.user_id = auth.uid() AND tm.member_type = 'manager' AND tm.status = 'active';
$$;

GRANT EXECUTE ON FUNCTION get_my_organisations_rpc() TO authenticated;
