-- DEBUG: Run this in Supabase SQL Editor to verify login redirect data
-- Replace 'USER_EMAIL_HERE' with the actual user email

-- 1. Check auth.users id for the email
SELECT id AS auth_user_id, email
FROM auth.users
WHERE email = 'USER_EMAIL_HERE';

-- 2. Check organisations (owner_id must = auth.users.id)
SELECT id, name, owner_id, onboarding_completed
FROM public.organisations
WHERE owner_id = (SELECT id FROM auth.users WHERE email = 'USER_EMAIL_HERE');

-- 3. Check team_members (user_id must = auth.users.id)
SELECT tm.id, tm.user_id, tm.organisation_id, tm.hierarchy_level, tm.status
FROM public.team_members tm
WHERE tm.user_id = (SELECT id FROM auth.users WHERE email = 'USER_EMAIL_HERE');

-- 4. Full join: does team_members.user_id match auth.users.id?
SELECT
  au.id AS auth_user_id,
  au.email,
  o.id AS org_id,
  o.owner_id,
  o.onboarding_completed,
  tm.id AS tm_id,
  tm.user_id AS tm_user_id,
  tm.hierarchy_level,
  tm.status
FROM auth.users au
LEFT JOIN public.organisations o ON o.owner_id = au.id
LEFT JOIN public.team_members tm ON tm.user_id = au.id
WHERE au.email = 'USER_EMAIL_HERE';
