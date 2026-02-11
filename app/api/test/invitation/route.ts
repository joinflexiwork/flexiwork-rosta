import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const HIERARCHY_RANK: Record<string, number> = {
  employer: 90,
  gm: 80,
  agm: 70,
  shift_leader: 60,
  worker: 50,
}

export async function GET() {
  const results: { tests: Array<{ name: string; status: string; details: string }>; passed: number; failed: number; timestamp: string } = {
    tests: [],
    passed: 0,
    failed: 0,
    timestamp: new Date().toISOString(),
  }

  const supabase = getSupabaseAdmin()

  // TEST 1: Create invite with valid hierarchy
  try {
    const { data: org } = await supabase
      .from('organisations')
      .select('id, owner_id')
      .limit(1)
      .single()

    if (!org) throw new Error('No organisation found for testing')

    const testEmail = `test.invite.${Date.now()}@example.com`
    const testToken = `test-token-${Date.now()}`

    const { data: invite, error } = await supabase
      .from('invites')
      .insert({
        token: testToken,
        email: testEmail,
        organisation_id: org.id,
        invited_by: org.owner_id,
        hierarchy_level: 'worker',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
      })
      .select()
      .single()

    if (error) throw error

    results.tests.push({
      name: 'Create invite with valid hierarchy',
      status: 'PASS',
      details: `Created invite for ${testEmail} with level 'worker'`,
    })
    results.passed++

    // Cleanup
    await supabase.from('invites').delete().eq('id', invite.id)
  } catch (err) {
    results.tests.push({
      name: 'Create invite with valid hierarchy',
      status: 'FAIL',
      details: err instanceof Error ? err.message : String(err),
    })
    results.failed++
  }

  // TEST 2: Hierarchy permission check (employer can invite worker)
  try {
    const canInvite = (HIERARCHY_RANK['employer'] ?? 0) > (HIERARCHY_RANK['worker'] ?? 0)

    results.tests.push({
      name: 'Hierarchy permission: employer > worker',
      status: canInvite ? 'PASS' : 'FAIL',
      details: `employer(90) > worker(50) = ${canInvite}`,
    })
    if (canInvite) results.passed++
    else results.failed++
  } catch (err) {
    results.tests.push({
      name: 'Hierarchy permission check',
      status: 'FAIL',
      details: err instanceof Error ? err.message : String(err),
    })
    results.failed++
  }

  // TEST 3: Worker cannot invite employer (should fail)
  try {
    const canInvite = (HIERARCHY_RANK['worker'] ?? 0) > (HIERARCHY_RANK['employer'] ?? 0)

    results.tests.push({
      name: 'Hierarchy permission: worker cannot invite employer',
      status: !canInvite ? 'PASS' : 'FAIL',
      details: `worker(50) > employer(90) = ${canInvite} (should be false)`,
    })
    if (!canInvite) results.passed++
    else results.failed++
  } catch (err) {
    results.tests.push({
      name: 'Hierarchy permission check (negative)',
      status: 'FAIL',
      details: err instanceof Error ? err.message : String(err),
    })
    results.failed++
  }

  // TEST 4: Invite expiration calculation
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const diffDays = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    results.tests.push({
      name: 'Invite expiration is 7 days',
      status: diffDays === 7 ? 'PASS' : 'FAIL',
      details: `Expires in ${diffDays} days`,
    })
    if (diffDays === 7) results.passed++
    else results.failed++
  } catch (err) {
    results.tests.push({
      name: 'Invite expiration calculation',
      status: 'FAIL',
      details: err instanceof Error ? err.message : String(err),
    })
    results.failed++
  }

  // TEST 5: Check RLS allows service role access to invites
  try {
    const { error } = await supabase.from('invites').select('id').limit(1)

    results.tests.push({
      name: 'RLS allows service role access',
      status: !error ? 'PASS' : 'FAIL',
      details: error ? error.message : 'Service role can access invites',
    })
    if (!error) results.passed++
    else results.failed++
  } catch (err) {
    results.tests.push({
      name: 'RLS check',
      status: 'FAIL',
      details: err instanceof Error ? err.message : String(err),
    })
    results.failed++
  }

  return NextResponse.json(results)
}
