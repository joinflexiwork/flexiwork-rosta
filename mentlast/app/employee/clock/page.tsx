'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { clockIn, clockOut } from '@/lib/services/timekeeping'
import { supabase } from '@/lib/supabase'
import { Clock, MapPin, CheckCircle } from 'lucide-react'

function ClockContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const shiftId = searchParams.get('shift')

  const [shift, setShift] = useState<Record<string, unknown> | null>(null)
  const [allocation, setAllocation] = useState<Record<string, unknown> | null>(null)
  const [timekeeping, setTimekeeping] = useState<Record<string, unknown> | null>(null)
  const [teamMemberId, setTeamMemberId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [location, setLocation] = useState<string>('')

  useEffect(() => {
    if (!shiftId) return
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

        const { data: shiftData } = await supabase
          .from('rota_shifts')
          .select(`
            *,
            venue:venues(id, name, address),
            role:roles(id, name, colour)
          `)
          .eq('id', shiftId)
          .single()

        setShift(shiftData as Record<string, unknown>)

        const { data: allocationData } = await supabase
          .from('shift_allocations')
          .select('*')
          .eq('rota_shift_id', shiftId)
          .eq('team_member_id', tm.id)
          .single()

        setAllocation(allocationData as Record<string, unknown>)

        const { data: timekeepingData } = await supabase
          .from('timekeeping_records')
          .select('*')
          .eq('rota_shift_id', shiftId)
          .eq('team_member_id', tm.id)
          .maybeSingle()

        setTimekeeping(timekeepingData as Record<string, unknown> | null)
      } catch (error) {
        console.error('Error loading shift:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [shiftId])

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation(`${position.coords.latitude},${position.coords.longitude}`)
        },
        () => setLocation('Location unavailable')
      )
    }
  }, [])

  async function handleClockIn() {
    if (!shiftId || !shift) return
    setProcessing(true)
    try {
      const record = await clockIn({
        rota_shift_id: shiftId,
        team_member_id: teamMemberId,
        venue_id: String(shift.venue_id),
        location,
      })
      alert('Clocked in successfully!')
      setTimekeeping(record as unknown as Record<string, unknown>)
    } catch (error) {
      console.error('Error clocking in:', error)
      alert('Failed to clock in. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  async function handleClockOut() {
    if (!timekeeping?.id) return
    setProcessing(true)
    try {
      await clockOut({
        timekeeping_record_id: String(timekeeping.id),
        location,
      })
      alert('Clocked out successfully! Your timesheet has been submitted for approval.')
      router.push('/employee/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Error clocking out:', error)
      alert('Failed to clock out. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-600">Loading shift...</div>
      </div>
    )
  }

  if (!shift || !allocation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-2">Shift Not Found</h1>
          <p className="text-gray-600 mb-6">Unable to load shift details.</p>
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

  const role = shift.role as Record<string, unknown> | undefined
  const venue = shift.venue as Record<string, unknown> | undefined
  const isClockedIn =
    timekeeping &&
    timekeeping.clock_in &&
    !timekeeping.clock_out

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-primary text-white p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-8 h-8" />
              <div>
                <h1 className="text-2xl font-bold">
                  {isClockedIn ? 'Clock Out' : 'Clock In'}
                </h1>
                <p className="text-blue-100">
                  {shift.shift_date
                    ? new Date(String(shift.shift_date)).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })
                    : ''}
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-2">Scheduled Time</div>
              <div className="text-2xl font-bold text-gray-900">
                {String(shift.start_time)} - {String(shift.end_time)}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {String(role?.name ?? '')} • {String(venue?.name ?? '')}
              </div>
            </div>
            {Boolean(isClockedIn && timekeeping?.clock_in) && timekeeping && (
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div className="font-semibold text-green-900">Clocked In</div>
                </div>
                <div className="text-sm text-gray-700">
                  Started at{' '}
                  {new Date(String(timekeeping.clock_in)).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            )}
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-700">
                <span className="font-semibold">Location:</span>{' '}
                {location || 'Getting location...'}
              </div>
            </div>
            {isClockedIn ? (
              <button
                type="button"
                onClick={handleClockOut}
                disabled={processing}
                className="w-full px-6 py-4 bg-gradient-primary text-white rounded-lg font-medium text-lg hover:shadow-lg transition-all disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Clock Out & Submit Timesheet'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClockIn}
                disabled={processing}
                className="w-full px-6 py-4 bg-gradient-primary text-white rounded-lg font-medium text-lg hover:shadow-lg transition-all disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Clock In'}
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push('/employee/dashboard')}
              className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ClockPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    }>
      <ClockContent />
    </Suspense>
  )
}
