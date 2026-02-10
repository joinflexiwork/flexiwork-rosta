-- Fix invite acceptance: allow 'employee' and handle existing data
-- Run in Supabase SQL Editor. Fixes: "check constraint profiles_user_type_check is violated by some row"

-- 1. See what user_type values currently exist (run this first and check the result)
SELECT user_type, COUNT(*) AS cnt
FROM public.profiles
GROUP BY user_type
ORDER BY user_type;

-- 2. Drop the existing constraint so we can update rows (current constraint may disallow 'employee')
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_type_check;

-- 3. Normalize: set any value that isn't 'employer' or 'employee' (or NULL) to 'employee'
UPDATE public.profiles
SET user_type = 'employee'
WHERE user_type IS NULL
   OR user_type NOT IN ('employer', 'employee');

-- 4. Add constraint that allows only employer + employee
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_type_check
  CHECK (user_type IN ('employer', 'employee'));

-- 5. Verify (optional)
SELECT user_type, COUNT(*) AS cnt
FROM public.profiles
GROUP BY user_type;
