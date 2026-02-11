-- Allow any team member (active/pending) to read their organisation (for profile page org name, audit, etc.).
CREATE POLICY "Team members can view their org"
  ON organisations FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT organisation_id FROM team_members
      WHERE user_id = auth.uid() AND status IN ('active', 'pending')
    )
  );
