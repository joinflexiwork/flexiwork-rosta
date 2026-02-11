-- Fix 42703: ensure notification_preferences.type exists (some DBs may have been created without it).
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'email';

-- If the column was just added, backfill from existing rows (idempotent).
-- No-op if type already had values; default handles new rows.
COMMENT ON COLUMN notification_preferences.type IS 'Notification type id, e.g. shift_changes, weekly_summary';
