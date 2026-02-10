import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client with service role key.
 * Use only in API routes or server code for admin auth (e.g. inviteUserByEmail).
 * Never expose this client or the service role key to the browser.
 */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export { getSupabaseAdmin }
