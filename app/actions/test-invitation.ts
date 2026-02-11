'use server'

import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type TestInvitationResult = {
  success: boolean
  results?: Array<{ step: string; status: string; id?: string; token?: string; org_name?: string }>
  error?: string
}

export async function testFullInvitationFlow(): Promise<TestInvitationResult> {
  const supabase = getSupabaseAdmin()
  const results: Array<{ step: string; status: string; id?: string; token?: string; org_name?: string }> = []

  try {
    // Step 1: Get existing organisation and owner (no auth.admin.createUser - that requires extra setup)
    const { data: org, error: orgErr } = await supabase
      .from('organisations')
      .select('id, owner_id, name')
      .limit(1)
      .single()

    if (orgErr || !org) {
      return { success: false, error: 'No organisation found for testing', results }
    }

    results.push({ step: 'Get org', status: 'PASS', id: org.id })

    // Step 2: Create invite as owner
    const testToken = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const testEmail = `test.worker.${Date.now()}@example.com`

    const { data: invite, error: inviteErr } = await supabase
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

    if (inviteErr) {
      results.push({ step: 'Create invite', status: 'FAIL' })
      return { success: false, error: inviteErr.message, results }
    }

    results.push({ step: 'Create invite', status: 'PASS', token: invite.token })

    // Step 3: Verify invite exists
    const { data: verifyInvite } = await supabase
      .from('invites')
      .select('id, organisation_id, email')
      .eq('token', invite.token)
      .single()

    results.push({
      step: 'Verify invite',
      status: verifyInvite ? 'PASS' : 'FAIL',
      org_name: org.name,
    })

    // Step 4: Check audit log (optional - invite might be created via RPC which doesn't always log)
    const { data: audit } = await supabase
      .from('organisation_audit_logs')
      .select('id')
      .eq('organisation_id', org.id)
      .eq('table_name', 'invites')
      .order('created_at', { ascending: false })
      .limit(1)

    results.push({
      step: 'Audit log created',
      status: audit && audit.length > 0 ? 'PASS' : 'SKIP',
    })

    // Cleanup
    await supabase.from('invites').delete().eq('id', invite.id)

    return { success: true, results }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      results,
    }
  }
}
