-- Role management and team member rating
-- Run after phase1_4 and audit_fixes

-- Team members: performance rating (1-5) and updated_at
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Roles: ensure description and colour exist (phase1 has them; colour is TEXT)
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS colour TEXT DEFAULT '#3B82F6',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Trigger to set updated_at on team_members update
CREATE OR REPLACE FUNCTION set_team_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_members_updated_at ON team_members;
CREATE TRIGGER team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE PROCEDURE set_team_members_updated_at();

COMMENT ON COLUMN team_members.rating IS 'Manager performance rating 1-5 stars';
