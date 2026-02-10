'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, AlertCircle, Star } from 'lucide-react'
import { getMyAllocatedShifts } from '@/lib/services/allocations'
import { getMyPendingInvites } from '@/lib/services/invites'
import { supabase } from '@/lib/supabase'

export default function EmployeeDashboard() {
  const [upcomingShifts, setUpcomingShifts] = useState<Record<string, unknown>[]>([])
  const [pendingInvites, setPendingInvites] = useState<Record<string, unknown>[]>([])
  const [todayShift, setTodayShift] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const [shifts, invites] = await Promise.all([
          getMyAllocatedShifts(user.id),
          getMyPendingInvites(user.id),
        ])
        setUpcomingShifts(shifts.slice(0, 5))
        setPendingInvites(invites)
        const today = new Date().toISOString().split('T')[0]
        const todayAllocation = shifts.find((s: Record<string, unknown>) => {
          const shift = s.shift as Record<string, unknown>
          return shift?.shift_date === today
        })
        setTodayShift(todayAllocation ?? null)
      } catch (error) {
        console.error('Error loading dashboard:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-primary text-white p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Hi there!</h1>
          <p className="text-blue-100">Here&apos;s your schedule</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {todayShift && (
          <div className="bg-white rounded-xl p-6 shadow-sm border-2 border-blue-500">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-lg">Today&apos;s Shift</h2>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {String((todayShift.shift as Record<string, unknown>)?.start_time ?? '')} - {String((todayShift.shift as Record<string, unknown>)?.end_time ?? '')}
                </div>
                <div className="text-sm text-gray-600">
                  {String(((todayShift.shift as Record<string, unknown>)?.role as Record<string, unknown> | undefined)?.name ?? '')} •{' '}
                  {String(((todayShift.shift as Record<string, unknown>)?.venue as Record<string, unknown> | undefined)?.name ?? '')}
                </div>
              </div>
              <Link
                href={`/employee/clock?shift=${todayShift.rota_shift_id}`}
                className="px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                Clock In
              </Link>
            </div>
          </div>
        )}

        {pendingInvites.length > 0 && (
          <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <h2 className="font-bold text-lg">Shift Invites</h2>
              </div>
              <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                {pendingInvites.length} pending
              </span>
            </div>
            <div className="space-y-3">
              {pendingInvites.map((invite) => {
                const shift = invite.shift as Record<string, unknown>
                const role = shift?.role as Record<string, unknown>
                const venue = shift?.venue as Record<string, unknown>
                return (
                  <div key={String(invite.id)} className="bg-white rounded-lg p-4 border border-amber-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-gray-900 mb-1">{String(role?.name ?? '')}</div>
                        <div className="text-sm text-gray-600">
                          {shift?.shift_date
                            ? new Date(String(shift.shift_date)).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })
                            : ''}
                        </div>
                        <div className="text-sm text-gray-600">
                          {String(shift?.start_time ?? '')} - {String(shift?.end_time ?? '')}
                        </div>
                        <div className="text-sm text-gray-500">{String(venue?.name ?? '')}</div>
                      </div>
                      <Link
                        href={`/employee/invites/${invite.id}`}
                        className="px-4 py-2 bg-gradient-primary text-white rounded-lg text-sm font-medium hover:shadow-lg"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Upcoming Shifts</div>
            <div className="text-3xl font-bold">{upcomingShifts.length}</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">This Week</div>
            <div className="text-3xl font-bold">
              {upcomingShifts.filter((s) => {
                const shift = s.shift as Record<string, unknown>
                const shiftDate = shift?.shift_date ? new Date(String(shift.shift_date)) : new Date(0)
                const weekFromNow = new Date()
                weekFromNow.setDate(weekFromNow.getDate() + 7)
                return shiftDate <= weekFromNow
              }).length}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="font-bold text-lg mb-4">Upcoming Shifts</h2>
          <div className="space-y-3">
            {upcomingShifts.map((allocation) => {
              const shift = allocation.shift as Record<string, unknown>
              const role = shift?.role as Record<string, unknown>
              const venue = shift?.venue as Record<string, unknown>
              const dateStr = shift?.shift_date as string
              return (
                <div
                  key={String(allocation.id)}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all"
                >
                  <div className="w-12 h-12 bg-gradient-primary rounded-lg flex flex-col items-center justify-center text-white">
                    <div className="text-xs font-medium">
                      {dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short' }) : ''}
                    </div>
                    <div className="text-lg font-bold">
                      {dateStr ? new Date(dateStr).getDate() : ''}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{String(role?.name ?? '')}</div>
                    <div className="text-sm text-gray-600">
                      {String(shift?.start_time ?? '')} - {String(shift?.end_time ?? '')}
                    </div>
                    <div className="text-sm text-gray-500">{String(venue?.name ?? '')}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-gradient-primary rounded-xl p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Star className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-2">Unlock More Opportunities</h3>
              <p className="text-blue-100 mb-4">
                Become a FlexiWork Gig Worker and work at ANY participating business
              </p>
              <button
                type="button"
                disabled
                className="px-6 py-2 bg-white/20 text-white rounded-lg font-medium opacity-50 cursor-not-allowed"
              >
                Coming Soon - Phase 2
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
