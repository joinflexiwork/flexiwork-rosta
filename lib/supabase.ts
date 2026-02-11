import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
const rawKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()

const supabaseUrl =
  rawUrl.startsWith('http') && rawUrl.length > 20
    ? rawUrl
    : 'https://placeholder.supabase.co'
const supabaseAnonKey =
  rawKey.length > 0 && rawKey !== 'your_supabase_anon_key_here'
    ? rawKey
    : 'placeholder-key'

if (typeof window !== 'undefined' && (supabaseUrl.includes('placeholder') || supabaseAnonKey === 'placeholder-key')) {
  console.error(
    '[Supabase] Missing or invalid NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Check .env.local and restart the dev server.'
  )
}

/**
 * Browser: cookie-based client so middleware can read session.
 * Server: plain client (middleware uses its own createServerClient with request cookies).
 */
export const supabase =
  typeof window === 'undefined'
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createBrowserClient(supabaseUrl, supabaseAnonKey)
