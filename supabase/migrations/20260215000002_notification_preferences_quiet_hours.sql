-- Add missing columns to notification_preferences (fix: column np.quiet_hours_start does not exist)
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_start time DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end time DEFAULT '08:00';
