'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type InviteData = {
  id: string
  code: string
  manager_name: string | null
  venue_name: string | null
  venue_address: string | null
  role_name: string | null
  shift_date: string
  start_time: string
  end_time: string
  expires_at: string | null
  invited_email: string | null
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(t: string) {
  const [h, m] = (t || '').split(':')
  const hh = parseInt(h ?? '0', 10)
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 || 12
  return `${h12}:${(m ?? '00').slice(0, 2)} ${ampm}`
}

export default function InviteCodePage({ params }: { params: Promise<{ code: string }> }) {
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    params.then((p) => {
      const c = (p.code ?? '').trim()
      if (!c) {
        setError('Missing invite code')
        setLoading(false)
        return
      }
      fetch(`/api/invite/shift/${encodeURIComponent(c)}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return
          if (data.error && !data.invite) {
            setError(data.error)
            setInvite(null)
          } else {
            setError(null)
            setInvite(data.invite ?? null)
          }
        })
        .catch(() => {
          if (!cancelled) setError('Failed to load invite')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })
    return () => { cancelled = true }
  }, [params])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
        <div className="text-gray-600 font-medium">Loading invite…</div>
      </div>
    )
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">Invite not found</h1>
          <p className="text-gray-600 mb-6">{error ?? 'This invite may have expired or already been used.'}</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
          >
            Go to FlexiWork
          </Link>
        </div>
      </div>
    )
  }

  const shiftLine = `${formatDate(invite.shift_date)}, ${formatTime(invite.start_time)} – ${formatTime(invite.end_time)}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-6">
            📱 Job Invitation – {invite.role_name ?? 'Shift'}
          </h1>

          <div className="space-y-4 text-gray-700">
            {invite.venue_name && (
              <p><span className="text-gray-500">📍 Venue:</span> {invite.venue_name}</p>
            )}
            <p><span className="text-gray-500">🕐 Shift:</span> {shiftLine}</p>
            {invite.manager_name && (
              <p><span className="text-gray-500">👨‍💼 Manager:</span> {invite.manager_name}</p>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-2">To accept this shift:</p>
            <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 mb-4">
              <li>Open FlexiWork app on your phone (Expo Go)</li>
              <li>Tap &quot;Register&quot;</li>
              {invite.invited_email && (
                <li>Use this email: <strong className="text-gray-900">{invite.invited_email}</strong></li>
              )}
              <li>Enter invite code: <strong className="text-gray-900">{invite.code}</strong></li>
            </ol>

            <p className="text-sm text-gray-500 mb-2">Invite code:</p>
            <p className="text-3xl font-bold tracking-wider text-center py-4 bg-gray-100 rounded-xl text-gray-900 font-mono">
              {invite.code}
            </p>

            <p className="text-sm text-amber-600 mt-4 text-center">⏰ Expires in 48 hours</p>
          </div>
        </div>
      </div>
    </div>
  )
}
