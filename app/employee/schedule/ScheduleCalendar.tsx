'use client'

import { useMemo, useCallback } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { CalendarDays } from 'lucide-react'

const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

export type ShiftEvent = {
  start: Date
  end: Date
  title: string
  resource: { allocationId: string; status?: string; venueName?: string; roleName?: string }
}

function formatEventTime(start: Date, end: Date): string {
  return `${format(start, 'h:mm a', { locale: enUS })} – ${format(end, 'h:mm a', { locale: enUS })}`
}

type Props = {
  events: ShiftEvent[]
  loading: boolean
  date: Date
  view: 'month' | 'week' | 'agenda'
  onNavigate: (date: Date) => void
  onView: (view: string) => void
  onSelectEvent: (event: ShiftEvent) => void
}

export default function ScheduleCalendar({
  events,
  loading,
  date,
  view,
  onNavigate,
  onView,
  onSelectEvent,
}: Props) {
  const handleNavigate = useCallback((newDate: Date) => onNavigate(newDate), [onNavigate])
  const handleView = useCallback((newView: string) => onView(newView), [onView])

  const eventStyleGetter = useMemo(
    () => (event: ShiftEvent) => {
      const status = event.resource?.status ?? 'allocated'
      const isConfirmed = status === 'confirmed' || status === 'in_progress'
      return {
        style: {
          backgroundColor: isConfirmed ? '#16a34a' : '#d97706',
          borderRadius: '8px',
          border: 'none',
          padding: '2px 6px',
        },
      }
    },
    []
  )

  const components = useMemo(
    () => ({
      event: ({ event }: { event: ShiftEvent }) => (
        <div className="flex flex-col min-w-0 overflow-hidden">
          <span className="font-semibold text-white text-xs truncate">
            {formatEventTime(event.start, event.end)}
          </span>
          <span className="font-bold text-white text-sm truncate">{event.resource?.venueName ?? event.title}</span>
          {event.resource?.roleName && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5 ${
                (event.resource?.status === 'confirmed' || event.resource?.status === 'in_progress')
                  ? 'bg-white/25 text-white'
                  : 'bg-amber-200/90 text-amber-900'
              }`}
            >
              {event.resource.roleName}
            </span>
          )}
        </div>
      ),
    }),
    []
  )

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
            <CalendarDays className="w-8 h-8 text-indigo-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No shifts yet</h3>
          <p className="text-gray-600 text-sm max-w-xs">
            When you&apos;re assigned shifts, they&apos;ll appear here. Check your invitations or ask your manager.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="h-[520px] p-4">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          date={date}
          onNavigate={handleNavigate}
          view={view}
          onView={handleView}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={onSelectEvent}
          views={['month', 'week', 'agenda']}
          components={components}
        />
      </div>
    </div>
  )
}
