-- Migration: Add organisation_settings table for feature toggles (Rating System visibility)
-- Run this in Supabase SQL Editor to fix the "table not found" error

-- 1. Create the organisation_settings table
CREATE TABLE IF NOT EXISTS organisation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  show_ratings BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organisation_id)
);

-- 2. Insert default settings for existing organisations (ratings visible by default)
INSERT INTO organisation_settings (organisation_id, show_ratings)
SELECT id, true FROM organisations
ON CONFLICT (organisation_id) DO NOTHING;

-- 3. Enable RLS
ALTER TABLE organisation_settings ENABLE ROW LEVEL SECURITY;

-- 4. Policy: only organisation owners can manage (insert/update/delete) settings
CREATE POLICY "Owners can manage org settings" ON organisation_settings
  FOR ALL
  USING (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()))
  WITH CHECK (organisation_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid()));

-- 5. Policy: team members (workers, managers) can read their org settings so the app can show/hide ratings
CREATE POLICY "Team members can read org settings" ON organisation_settings
  FOR SELECT
  USING (organisation_id IN (SELECT organisation_id FROM team_members WHERE user_id = auth.uid()));
