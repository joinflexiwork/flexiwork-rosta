-- Add missing columns to team_members for invite functionality
-- Current columns (phase1 + add_member_type): id, organisation_id, user_id, employment_type,
--   status, primary_venue_id, invite_code, invited_at, joined_at, created_at, member_type
-- member_type already covers 'employee' | 'manager', so role_type is not added.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Add index for email lookups (e.g. dedupe or lookup pending invites)
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email) WHERE email IS NOT NULL;

-- RLS: existing policies (Employers can insert/update team, Employees can update own record on accept)
-- already allow inserts/updates by organisation_id or user_id; email and full_name are
-- part of the same row, so no policy changes needed.
