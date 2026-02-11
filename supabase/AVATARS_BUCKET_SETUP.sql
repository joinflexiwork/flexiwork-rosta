-- ============================================
-- Avatars storage bucket setup
-- Run in Supabase SQL Editor if bucket doesn't exist
-- ============================================
-- Note: If INSERT fails, create the bucket manually in Dashboard:
-- Storage → New bucket → id: avatars, Public: true, 2MB limit, image/jpeg, image/png
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
