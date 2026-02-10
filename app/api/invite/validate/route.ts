import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = (searchParams.get('code') ?? '').trim().toUpperCase()
    if (!code) {
      return NextResponse.json({ valid: false, error: 'Missing code' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: row, error } = await supabase
      .from('team_members')
      .select('id, email, status, invite_type')
      .eq('invite_code', code)
      .eq('status', 'pending')
      .maybeSingle()

    if (error) {
      console.error('[Invite Validate]', error)
      return NextResponse.json({ valid: false }, { status: 500 })
    }

    if (!row) {
      return NextResponse.json({ valid: false })
    }

    const r = row as { email?: string | null; invite_type?: string | null }
    return NextResponse.json({
      valid: true,
      email: r.email ?? undefined,
      inviteType: r.invite_type ?? 'team',
    })
  } catch (err) {
    console.error('[Invite Validate]', err)
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
