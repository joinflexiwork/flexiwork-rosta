'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { CalendarDays } from 'lucide-react'
import { getWorkerShifts } from '@/lib/services/allocations'
import { supabase } from '@/lib/supabase'
import WorkerShiftDetailModal from '@/components/WorkerShiftDetailModal'
import type { ShiftEvent } from './ScheduleCalendar'

const ScheduleCalendar = dynamic(() => import('./ScheduleCalendar'), { ssr: false })

function buildEvents(shifts: Record<string, unknown>[]): ShiftEvent[] {
  return shifts.map((s) => {
    const shift = s.shift as Record<string, unknown> | undefined
    const venue = shift?.venue as { name?: string } | undefined
    const role = shift?.role as { name?: string } | undefined
    const dateStr = String(shift?.shift_date ?? '')
    const startTime = String(shift?.start_time ?? '00:00')
    const endTime = String(shift?.end_time ?? '00:00')
    const start = new Date(`${dateStr}T${startTime}`)
    const end = new Date(`${dateStr}T${endTime}`)
    const venueName = venue?.name ?? 'Shift'
    const roleName = role?.name ?? ''
    const title = roleName ? `${venueName} – ${roleName}` : venueName
    return {
      start,
      end,
      title,
      resource: {
        allocationId: String(s.id),
        status: String(s.status ?? ''),
        venueName,
        roleName,
      },
    }
  })
}

export default function EmployeeSchedulePage() {
  const [events, setEvents] = useState<ShiftEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [detailAllocationId, setDetailAllocationId] = useState<string | null>(null)
  const [date, setDate] = useState<Date>(() => new Date())
  const [view, setView] = useState<'month' | 'week' | 'agenda'>('week')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setLoading(false)
        return
      }
      try {
        const shifts = await getWorkerShifts(user.id)
        if (!cancelled) setEvents(buildEvents(shifts))
      } catch (e) {
        console.error('Failed to load worker shifts:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleNavigate = useCallback((newDate: Date) => setDate(newDate), [])
  const handleView = useCallback((newView: string) => {
    if (newView === 'month' || newView === 'week' || newView === 'agenda') setView(newView)
  }, [])
  const handleSelectEvent = useCallback((event: ShiftEvent) => {
    setDetailAllocationId(event.resource.allocationId)
  }, [])

  return (
    <div className="min-h-screen">
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-b-3xl px-6 pt-6 pb-10 text-white shadow-lg">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-1">Schedule</h1>
          <p className="text-indigo-100 text-sm">Your shifts. Tap one for details.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 -mt-6">
        <ScheduleCalendar
          events={events}
          loading={loading}
          date={date}
          view={view}
          onNavigate={handleNavigate}
          onView={handleView}
          onSelectEvent={handleSelectEvent}
        />
        <WorkerShiftDetailModal
          allocationId={detailAllocationId}
          onClose={() => setDetailAllocationId(null)}
        />
      </div>
    </div>
  )
}
