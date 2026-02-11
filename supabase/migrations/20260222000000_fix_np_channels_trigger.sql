-- ============================================
-- FIX: column np.channels does not exist
-- Root cause: log_hierarchy_change trigger calls create_notification() which
-- expects OLD notification_preferences schema (user_id, type, channels).
-- New schema (20260220000000) has profile_id, organisation_id, hierarchy_changes, etc.
-- The app's notifyHierarchyChange() already handles hierarchy notifications.
-- ============================================

-- Drop the broken trigger - hierarchy notifications are sent by the app
DROP TRIGGER IF EXISTS trigger_log_hierarchy_change ON team_members;

-- Optionally drop the trigger function (no longer used by this trigger)
-- Note: create_notification may be referenced elsewhere; leave it for now.
-- If create_notification causes other errors, we can drop/replace it in a future migration.
