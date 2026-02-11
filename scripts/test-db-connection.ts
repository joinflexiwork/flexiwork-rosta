/**
 * Database connection test script.
 * Run: npx tsx scripts/test-db-connection.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local or env.
 */

import { createClient } from '@supabase/supabase-js'

const REQUIRED_TABLES = ['organisations', 'team_members', 'profiles', 'organisation_audit_logs', 'notifications'] as const
const REQUIRED_COLUMNS: Record<string, string[]> = {
  organisations: ['id', 'owner_id', 'name', 'created_at'],
  team_members: ['id', 'organisation_id', 'user_id', 'status', 'created_at'],
  profiles: ['id', 'full_name', 'email'],
  organisation_audit_logs: ['id', 'organisation_id', 'table_name', 'action', 'created_at'],
  notifications: ['id', 'user_id', 'type', 'title', 'read', 'created_at'],
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !key || url.includes('placeholder') || key === 'placeholder-key') {
    console.error('FAIL: Missing or placeholder NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
    process.exit(1)
  }

  console.log('Testing Supabase connection...')
  const supabase = createClient(url, key)

  let failed = false

  for (const table of REQUIRED_TABLES) {
    const { data, error } = await supabase.from(table).select(REQUIRED_COLUMNS[table]?.join(',') ?? '*').limit(1)
    if (error) {
      console.error(`FAIL: Table "${table}" - ${error.message}`)
      failed = true
    } else {
      console.log(`OK: Table "${table}" exists and readable (rows: ${Array.isArray(data) ? data.length : 0} sampled)`)
    }
  }

  const { data: orgs, error: orgError } = await supabase
    .from('organisations')
    .select('id, owner_id')
    .limit(1)
  if (orgError) {
    console.error('FAIL: RLS or read on organisations:', orgError.message)
    failed = true
  } else {
    console.log('OK: organisations read (RLS allows at least one query; may return 0 rows if no owner session)')
  }

  if (failed) {
    process.exit(1)
  }
  console.log('All database checks passed.')
}

main().catch((e) => {
  console.error('Script error:', e)
  process.exit(1)
})
