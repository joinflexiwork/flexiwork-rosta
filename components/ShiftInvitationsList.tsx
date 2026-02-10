'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, Calendar, MapPin, User } from 'lucide-react'
import { getMyPendingInvites, acceptShiftInvite, declineShiftInvite } from '@/lib/services/invites'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

type Invite = Record<string, unknown>

type Toast = { type: 'success' | 'error'; message: string } | null

export default function ShiftInvitationsList({
  userId,
  onInvitesChange,
  refreshTrigger = 0,
}: {
  userId: string
  onInvitesChange?: () => void
  /** Increment to force refetch (e.g. from realtime) */
  refreshTrigger?: number
}) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [teamMemberId, setTeamMemberId] = useState('')
  const [toast, setToast] = useState<Toast>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: tm } = await supabase.from('team_members').select('id').eq('user_id', userId)
        if (tm?.[0]?.id) setTeamMemberId(tm[0].id)
        const data = await getMyPendingInvites(userId)
        if (!cancelled) setInvites(data)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId, refreshTrigger])

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleAccept(inviteId: string) {
    if (!teamMemberId) return
    setProcessing(`accept-${inviteId}`)
    try {
      await acceptShiftInvite(inviteId, teamMemberId)
      const next = await getMyPendingInvites(userId)
      setInvites(next)
      onInvitesChange?.()
      showToast('success', 'Shift accepted! Check your schedule.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('filled') || msg.includes('no longer valid')) {
        showToast('error', 'Sorry, this shift was just taken by someone else.')
      } else {
        showToast('error', msg || 'Failed to accept.')
      }
      const next = await getMyPendingInvites(userId).catch(() => [])
      setInvites(next)
    } finally {
      setProcessing(null)
    }
  }

  async function handleDecline(inviteId: string) {
    setProcessing(`decline-${inviteId}`)
    try {
      await declineShiftInvite(inviteId)
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))
      onInvitesChange?.()
    } catch (e) {
      showToast('error', 'Failed to decline.')
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-amber-50 rounded-xl p-6 border border-amber-200 animate-pulse">
        <div className="h-6 w-40 bg-amber-200 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-amber-100 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (invites.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl p-8 border border-gray-200 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">No pending invitations</p>
        <p className="text-sm text-gray-500 mt-1">When a manager invites you to a shift, it will appear here.</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h2 className="font-bold text-lg">Shift invitations</h2>
          </div>
          <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            {invites.length} pending
          </span>
        </div>
        <p className="text-sm text-amber-800 mb-4">First-come, first-served. Accept to add to your schedule.</p>
        <div className="space-y-3">
          {invites.map((inv) => {
            const shift = inv.shift as Record<string, unknown>
            const role = shift?.role as Record<string, unknown>
            const venue = shift?.venue as Record<string, unknown>
            const inviter = inv.inviter as Record<string, unknown> | undefined
            const id = String(inv.id)
            const busy = processing !== null
            const dateStr = shift?.shift_date as string
            const startTime = String(shift?.start_time ?? '')
            const endTime = String(shift?.end_time ?? '')
            return (
              <div key={id} className="bg-white rounded-lg p-4 border border-amber-200">
                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900">{String(role?.name ?? 'Shift')}</div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      {dateStr ? format(new Date(dateStr), 'EEE, d MMM yyyy') : ''} • {startTime}–{endTime}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      {String(venue?.name ?? '')}
                    </div>
                    {inviter?.full_name ? (
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <User className="w-4 h-4 flex-shrink-0" />
                        From {String(inviter.full_name)}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDecline(id)}
                      disabled={busy}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAccept(id)}
                      disabled={busy}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {processing === `accept-${id}` ? 'Accepting...' : 'Accept shift'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
