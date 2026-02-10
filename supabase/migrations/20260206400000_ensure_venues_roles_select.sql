-- Ensure owner can SELECT venues and roles (fix "No venues yet" / "No roles yet" after setup)
-- Safe to run multiple times: drops then recreates.

DROP POLICY IF EXISTS "Users can view their venues" ON venues;
CREATE POLICY "Users can view their venues" ON venues
  FOR SELECT USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view their roles" ON roles;
CREATE POLICY "Users can view their roles" ON roles
  FOR SELECT USING (
    organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );
