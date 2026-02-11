import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/** GET /api/invite/validate-token?token=xxx – validate hierarchical invite token (no auth required). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = (searchParams.get('token') ?? '').trim()
    if (!token) {
      return NextResponse.json({ valid: false, error: 'Missing token' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: invite, error } = await supabase
      .from('invites')
      .select('id, email, organisation_id, hierarchy_level, expires_at, status')
      .eq('token', token)
      .maybeSingle()

    if (error) {
      console.error('[Invite Validate Token]', error)
      return NextResponse.json({ valid: false }, { status: 500 })
    }

    if (!invite) {
      return NextResponse.json({ valid: false })
    }

    const inv = invite as { status?: string; expires_at?: string | null }
    if (inv.status !== 'pending') {
      return NextResponse.json({ valid: false, reason: 'already_used' })
    }
    if (inv.expires_at && new Date(inv.expires_at) <= new Date()) {
      return NextResponse.json({ valid: false, reason: 'expired' })
    }

    return NextResponse.json({
      valid: true,
      email: (invite as { email?: string }).email ?? undefined,
      hierarchy_level: (invite as { hierarchy_level?: string }).hierarchy_level ?? undefined,
    })
  } catch (err) {
    console.error('[Invite Validate Token]', err)
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
