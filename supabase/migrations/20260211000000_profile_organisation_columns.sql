-- Profile page: first/last name, address. Organisation: tax_id, company_address, company_logo_url.
-- profiles: full_name already exists; add first_name, last_name for structured editing; address for personal address if needed.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

-- organisations: company details for employer profile section
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS company_address TEXT,
  ADD COLUMN IF NOT EXISTS company_logo_url TEXT;

-- Backfill full_name from first_name + last_name where full_name is null (optional)
-- UPDATE profiles SET full_name = trim(concat(first_name, ' ', last_name)) WHERE full_name IS NULL AND (first_name IS NOT NULL OR last_name IS NOT NULL);
