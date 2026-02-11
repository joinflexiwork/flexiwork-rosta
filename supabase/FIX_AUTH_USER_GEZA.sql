-- ============================================
-- FIX: Auth User vs Profile Mismatch (Geza)
-- joinflexiwork+10@gmail.com
-- Run in Supabase SQL Editor
-- ============================================
-- Problem: Profile + team_members exist, but auth user missing or password wrong
-- Result: "Invalid login credentials"
-- ============================================

-- ========== STEP 1: DIAGNOSTIC (run first to see state) ==========
SELECT 
    p.id as profile_id,
    p.email,
    p.full_name,
    au.id as auth_user_id,
    au.email as auth_email,
    au.email_confirmed_at,
    tm.hierarchy_level,
    tm.status as team_status
FROM profiles p
LEFT JOIN auth.users au ON au.email = p.email
LEFT JOIN team_members tm ON tm.user_id = p.id
WHERE p.email = 'joinflexiwork+10@gmail.com';

-- If auth_user_id is NULL: auth user missing
-- If auth_user_id exists: auth user exists but password may be wrong

-- Ensure pgcrypto is available (for crypt/gen_salt)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========== STEP 2: FIX (if auth user exists - reset password) ==========
-- Option A: Update password if auth user exists
UPDATE auth.users 
SET encrypted_password = crypt('FlexiWork2025!', gen_salt('bf')),
    email_confirmed_at = now()
WHERE email = 'joinflexiwork+10@gmail.com';

-- ========== STEP 3: FIX (if auth user MISSING - create it) ==========
-- Option B: Create auth user if missing (use profile.id from diagnostic)
-- Run ONLY if no rows were updated in step 2 (auth user doesn't exist)
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
SELECT 
    p.id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    p.email,
    crypt('FlexiWork2025!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', COALESCE(p.full_name, 'Geza')),
    now(),
    now()
FROM profiles p
WHERE p.email = 'joinflexiwork+10@gmail.com'
AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.email = p.email);

-- Also create identity for the new auth user (Supabase auth requires this)
INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    created_at,
    updated_at
)
SELECT 
    p.id,
    p.id,
    p.id::text,
    jsonb_build_object(
        'sub', p.id::text,
        'email', p.email,
        'email_verified', true
    ),
    'email',
    now(),
    now()
FROM profiles p
WHERE p.email = 'joinflexiwork+10@gmail.com'
AND NOT EXISTS (
    SELECT 1 FROM auth.identities i 
    WHERE i.user_id = p.id AND i.provider = 'email'
);

-- ========== VERIFICATION ==========
SELECT 
    p.id as profile_id,
    p.email,
    p.full_name,
    au.id as auth_user_id,
    au.email as auth_email,
    au.email_confirmed_at
FROM profiles p
LEFT JOIN auth.users au ON au.email = p.email
WHERE p.email = 'joinflexiwork+10@gmail.com';

-- ============================================
-- Tell user: "Jelszó: FlexiWork2025! - Bejelentkezés után változtasd meg!"
-- ============================================
