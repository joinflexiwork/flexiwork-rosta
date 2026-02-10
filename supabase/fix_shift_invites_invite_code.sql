-- Fix missing invite_code on shift_invites (schema cache error).
-- Run in Supabase SQL Editor.

-- 1. Check current columns (optional)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'shift_invites'
ORDER BY ordinal_position;

-- 2. Add invite_code if missing
ALTER TABLE shift_invites
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- 3. Unique index for invite_code (one code per invite)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_invites_invite_code
  ON shift_invites(invite_code) WHERE invite_code IS NOT NULL;

-- 4. Backfill existing rows so existing invites have a code
UPDATE shift_invites
SET invite_code = 'SI-' || id::text
WHERE invite_code IS NULL;

COMMENT ON COLUMN shift_invites.invite_code IS 'Short unique code for shareable link /invite/[code]';
