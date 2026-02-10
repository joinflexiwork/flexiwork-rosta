import { createClient } from '@supabase/supabase-js'

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
