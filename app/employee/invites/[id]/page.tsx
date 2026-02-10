'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { acceptShiftInvite, declineShiftInvite } from '@/lib/services/invites'
import { supabase } from '@/lib/supabase'
import { MapPin, Clock, Calendar, AlertCircle } from 'lucide-react'

export default function ShiftInvitePage() {
  const router = useRouter()
  const params = useParams()
  const inviteId = params.id as string

  const [invite, setInvite] = useState<Record<string, unknown> | null>(null)
  const [teamMemberId, setTeamMemberId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [declining, setDeclining] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: tm } = await supabase
          .from('team_members')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (!tm) return
        setTeamMemberId(tm.id)

        const { data: inviteData } = await supabase
          .from('shift_invites')
          .select(`
            *,
            shift:rota_shifts(
              *,
              venue:venues(id, name, address),
              role:roles(id, name, colour)
            )
          `)
          .eq('id', inviteId)
          .single()

        setInvite(inviteData as Record<string, unknown>)
      } catch (error) {
        console.error('Error loading invite:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [inviteId])

  async function handleAccept() {
    setAccepting(true)
    try {
      await acceptShiftInvite(inviteId, teamMemberId)
      alert('Shift accepted! It has been added to your schedule.')
      router.push('/employee/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('filled')) {
        alert('Sorry, someone else accepted this shift first. It is no longer available.')
        router.push('/employee/dashboard')
      } else {
        alert('Failed to accept shift. Please try again.')
      }
    } finally {
      setAccepting(false)
    }
  }

  async function handleDecline() {
    setDeclining(true)
    try {
      await declineShiftInvite(inviteId)
      alert('Shift declined.')
      router.push('/employee/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Error declining invite:', error)
      alert('Failed to decline shift.')
    } finally {
      setDeclining(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading invite...</div>
      </div>
    )
  }

  if (!invite || invite.status !== 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Invite Not Available</h1>
          <p className="text-gray-600 mb-6">
            {invite?.status === 'accepted'
              ? 'You have already accepted this shift.'
              : invite?.status === 'declined'
                ? 'You have declined this shift.'
                : 'This shift is no longer available.'}
          </p>
          <button
            type="button"
            onClick={() => router.push('/employee/dashboard')}
            className="px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const shift = invite.shift as Record<string, unknown>
  const venue = shift?.venue as Record<string, unknown> | undefined
  const role = shift?.role as Record<string, unknown> | undefined

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-primary text-white p-6">
            <h1 className="text-2xl font-bold mb-2">Shift Invite</h1>
            <p className="text-blue-100">You&apos;ve been invited to work this shift</p>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-500 mb-1">Date</div>
                <div className="font-semibold text-gray-900">
                  {shift?.shift_date
                    ? new Date(String(shift.shift_date)).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : ''}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-500 mb-1">Time</div>
                <div className="font-semibold text-gray-900">
                  {String(shift?.start_time ?? '')} - {String(shift?.end_time ?? '')}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <MapPin className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-500 mb-1">Location</div>
                <div className="font-semibold text-gray-900">{String(venue?.name ?? '')}</div>
                {venue?.address != null && String(venue.address) !== '' && (
                  <div className="text-sm text-gray-600">{String(venue.address)}</div>
                )}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Role</div>
              <span
                className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: `${String(role?.colour ?? '#3B82F6')}20`,
                  color: String(role?.colour ?? '#3B82F6'),
                }}
              >
                {String(role?.name ?? '')}
              </span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-700">
                  <span className="font-semibold">First-come, first-served:</span> This shift is
                  available to multiple employees. Accept quickly to secure it!
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDecline}
                disabled={declining || accepting}
                className="flex-1 px-6 py-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                {declining ? 'Declining...' : 'Decline'}
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting || declining}
                className="flex-1 px-6 py-4 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50"
              >
                {accepting ? 'Accepting...' : 'Accept Shift'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
