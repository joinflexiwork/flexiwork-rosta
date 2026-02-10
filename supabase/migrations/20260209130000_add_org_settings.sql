-- Organisation-level settings (e.g. feature toggles)
-- Run after add_rating_and_role_management

CREATE TABLE IF NOT EXISTS organisation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  show_ratings BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organisation_id)
);

-- RLS
ALTER TABLE organisation_settings ENABLE ROW LEVEL SECURITY;

-- Owners can read/update their org settings
CREATE POLICY "Owners can manage org settings" ON organisation_settings
  FOR ALL
  USING (
    organisation_id IN (
      SELECT id FROM organisations WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    organisation_id IN (
      SELECT id FROM organisations WHERE owner_id = auth.uid()
    )
  );

-- Trigger to set updated_at
CREATE OR REPLACE FUNCTION set_organisation_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organisation_settings_updated_at ON organisation_settings;
CREATE TRIGGER organisation_settings_updated_at
  BEFORE UPDATE ON organisation_settings
  FOR EACH ROW
  EXECUTE PROCEDURE set_organisation_settings_updated_at();

-- Seed existing organisations with default settings (show_ratings = true)
INSERT INTO organisation_settings (organisation_id, show_ratings)
  SELECT id, true FROM organisations
  ON CONFLICT (organisation_id) DO NOTHING;
