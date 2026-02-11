-- ============================================
-- REPAIR: Create missing team_members records
-- Run in Supabase SQL Editor
-- ============================================
-- EMPLOYER: joinfexiwork@gmail.com (3c4261c8-3a50-4041-99d1-d4c5ea00edb8)
-- WORKER: joinflexiwork@gmail.com (4185174e-0a64-4586-8e8a-4fa3cc797c31)
-- Employer org owner: 3c4261c8-3a50-4041-99d1-d4c5ea00edb8
-- ============================================

-- 1. EMPLOYER: Create team_members for org owner who has none
DO $$
DECLARE
  v_user_id UUID := '3c4261c8-3a50-4041-99d1-d4c5ea00edb8';
  v_org_id UUID;
BEGIN
  FOR v_org_id IN
    SELECT id FROM organisations WHERE owner_id = v_user_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM team_members
      WHERE organisation_id = v_org_id AND user_id = v_user_id
    ) THEN
      INSERT INTO team_members (
        organisation_id,
        user_id,
        hierarchy_level,
        employment_type,
        status
      ) VALUES (
        v_org_id,
        v_user_id,
        'employer',
        'full_time',
        'active'
      );
      RAISE NOTICE 'Created team_members for employer org %', v_org_id;
    END IF;
  END LOOP;
END $$;

-- 2. WORKER: Create team_members for worker (assign to employer's first org)
DO $$
DECLARE
  v_worker_id UUID := '4185174e-0a64-4586-8e8a-4fa3cc797c31';
  v_employer_id UUID := '3c4261c8-3a50-4041-99d1-d4c5ea00edb8';
  v_org_id UUID;
BEGIN
  SELECT id INTO v_org_id
  FROM organisations
  WHERE owner_id = v_employer_id
  LIMIT 1;

  IF v_org_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE organisation_id = v_org_id AND user_id = v_worker_id
  ) THEN
    INSERT INTO team_members (
      organisation_id,
      user_id,
      hierarchy_level,
      employment_type,
      status,
      joined_at
    ) VALUES (
      v_org_id,
      v_worker_id,
      'worker',
      'part_time',
      'active',
      NOW()
    );
    RAISE NOTICE 'Created team_members for worker %', v_worker_id;
  END IF;
END $$;

-- 3. OPTIONAL: Set onboarding_completed = true for employer's org (if already done)
-- Uncomment if employer has completed onboarding but flag was not set:
-- UPDATE organisations
-- SET onboarding_completed = true
-- WHERE owner_id = '3c4261c8-3a50-4041-99d1-d4c5ea00edb8';
