-- ============================================
-- FIX: Set onboarding_completed = true for employer
-- Run in Supabase SQL Editor
-- ============================================
-- Employer: joinfexiwork@gmail.com (3c4261c8-3a50-4041-99d1-d4c5ea00edb8)
-- ============================================

-- Set onboarding_completed = true for employer's organisations
UPDATE organisations
SET onboarding_completed = true
WHERE owner_id = '3c4261c8-3a50-4041-99d1-d4c5ea00edb8';

-- Verify the change
SELECT id, name, onboarding_completed, owner_id
FROM organisations
WHERE owner_id = '3c4261c8-3a50-4041-99d1-d4c5ea00edb8';
