-- ============================================
-- SAAS TENANT & OWNER ONBOARDING SCHEMA
-- Idempotent: safe to run multiple times
-- ============================================

-- 1. Ensure organisations table has required fields
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS company_address TEXT,
  ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'beta',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Set trial_ends_at for new orgs (14 days from now) if column exists and default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organisations' AND column_name = 'trial_ends_at'
  ) THEN
    ALTER TABLE public.organisations ADD COLUMN trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Indexes for SaaS queries
CREATE INDEX IF NOT EXISTS idx_organisations_owner ON public.organisations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organisations_subscription ON public.organisations(subscription_status);

-- 2. Extend organisation_audit_logs action CHECK to allow ORGANISATION_CREATED
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.organisation_audit_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%action%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.organisation_audit_logs DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.organisation_audit_logs
  ADD CONSTRAINT organisation_audit_logs_action_check
  CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'INVITE_SENT', 'ROLE_CHANGED', 'SHIFT_ASSIGNED', 'ORGANISATION_CREATED'));

-- 3. Trigger: When owner is set on new organisation, auto-create team_members record
-- team_members uses user_id (not profile_id), hierarchy_level (owner = employer for top level)
CREATE OR REPLACE FUNCTION handle_new_organisation_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employment_type TEXT := 'full_time';
BEGIN
  -- Only on INSERT or when owner_id changes
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.owner_id IS DISTINCT FROM NEW.owner_id) THEN
    IF NEW.owner_id IS NOT NULL THEN
      -- Auto-create team_members record for owner (user_id, hierarchy_level='employer')
      BEGIN
        INSERT INTO public.team_members (
          user_id,
          organisation_id,
          hierarchy_level,
          status,
          employment_type,
          created_at
        )
        VALUES (
          NEW.owner_id,
          NEW.id,
          'employer',
          'active',
          v_employment_type,
          NOW()
        );
      EXCEPTION WHEN unique_violation THEN
        UPDATE public.team_members
        SET hierarchy_level = 'employer', status = 'active', employment_type = v_employment_type
        WHERE organisation_id = NEW.id AND user_id = NEW.owner_id;
      END;

      -- Create audit log entry (organisation_audit_logs: user_id, table_name, record_id, action, old_data, new_data)
      INSERT INTO public.organisation_audit_logs (
        organisation_id,
        user_id,
        table_name,
        record_id,
        action,
        old_data,
        new_data
      )
      VALUES (
        NEW.id,
        NEW.owner_id,
        'organisations',
        NEW.id,
        'ORGANISATION_CREATED',
        NULL,
        jsonb_build_object('owner_id', NEW.owner_id, 'organisation_name', NEW.name)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_organisation_owner ON public.organisations;
CREATE TRIGGER trigger_new_organisation_owner
  AFTER INSERT OR UPDATE OF owner_id ON public.organisations
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_organisation_owner();

COMMENT ON TABLE public.organisations IS 'SaaS Tenant isolation unit. Owner_id = Tenant Admin';
