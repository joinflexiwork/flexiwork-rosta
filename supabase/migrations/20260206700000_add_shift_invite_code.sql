-- Add invite_code to shift_invites for public worker landing page /invite/[code]
ALTER TABLE shift_invites
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- Unique constraint so one code maps to one invite (add only if no duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_invites_invite_code
  ON shift_invites(invite_code) WHERE invite_code IS NOT NULL;

-- Backfill existing rows so we can query; new invites will get short codes from app
UPDATE shift_invites
SET invite_code = 'SI-' || id::text
WHERE invite_code IS NULL;

COMMENT ON COLUMN shift_invites.invite_code IS 'Short unique code for shareable link /invite/[code]';
