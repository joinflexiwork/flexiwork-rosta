-- ============================================
-- FIX: "column np.channels does not exist"
-- Run this in Supabase SQL Editor
-- ============================================
-- Root cause: The log_hierarchy_change trigger fires on team_members UPDATE
-- and calls create_notification() which expects OLD notification_preferences
-- schema (user_id, type, channels). The new schema has different columns.
-- The app's notifyHierarchyChange() already handles hierarchy notifications.
-- ============================================

DROP TRIGGER IF EXISTS trigger_log_hierarchy_change ON team_members;
