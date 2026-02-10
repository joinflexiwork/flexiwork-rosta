-- Allow 'employee' in profiles.user_type so invite acceptance can create profiles for invited workers.
-- Handles existing data: drop constraint, normalize unknown values, then re-add constraint.

-- 1. Drop existing check so we can update rows that have other values
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_type_check;

-- 2. Normalize: set any user_type not in ('employer','employee') or NULL to 'employee'
UPDATE public.profiles
SET user_type = 'employee'
WHERE user_type IS NULL
   OR user_type NOT IN ('employer', 'employee');

-- 3. Add constraint that allows employer (org owners) and employee (invited workers)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_type_check
  CHECK (user_type IN ('employer', 'employee'));
