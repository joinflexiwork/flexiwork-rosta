-- Ensure company_address exists on organisations (fix: schema cache error on profile save)
-- Idempotent: safe to run multiple times
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS company_address TEXT;
