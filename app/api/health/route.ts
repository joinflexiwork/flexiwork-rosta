import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const REQUIRED_TABLES = ['organisations', 'team_members', 'profiles', 'organisation_audit_logs', 'notifications'] as const

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const envOk =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
    typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string' &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  const hasPlaceholder = url.includes('placeholder') || key === 'placeholder-key'

  let dbStatus: 'ok' | 'error' = 'ok'
  let dbError: string | null = null
  let tablesAccessible: string[] = []
  let lastErrorTimestamp: string | null = null

  if (envOk && !hasPlaceholder) {
    try {
      const supabase = createClient(url, key)
      for (const table of REQUIRED_TABLES) {
        const { error } = await supabase.from(table).select('*').limit(1)
        if (!error) {
          tablesAccessible.push(table)
        } else {
          dbError = dbError ?? error.message
          dbStatus = 'error'
        }
      }
    } catch (e) {
      dbStatus = 'error'
      dbError = e instanceof Error ? e.message : String(e)
      lastErrorTimestamp = new Date().toISOString()
    }
  } else {
    dbStatus = 'error'
    dbError = !envOk
      ? 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
      : 'Supabase URL or key is placeholder'
  }

  const status = dbStatus === 'ok' && envOk ? 200 : 503
  const body = {
    status: dbStatus === 'ok' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    env: {
      supabaseUrlPresent: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKeyPresent: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasPlaceholder,
    },
    database: {
      connection: dbStatus,
      error: dbError,
      tablesChecked: REQUIRED_TABLES,
      tablesAccessible,
    },
    lastErrorTimestamp: lastErrorTimestamp ?? undefined,
  }

  return NextResponse.json(body, { status })
}
