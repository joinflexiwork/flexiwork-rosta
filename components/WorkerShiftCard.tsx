'use client'

import Link from 'next/link'
import { Clock, MapPin } from 'lucide-react'

function formatTime(t: string | undefined): string {
  if (!t) return '—'
  const [h, m] = String(t).split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${period}`
}

function formatShiftDate(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function statusLabel(status: string | undefined): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'confirmed') return 'Confirmed'
  if (s === 'allocated') return 'Pending'
  if (s === 'in_progress') return 'In progress'
  if (s === 'completed') return 'Completed'
  if (s === 'cancelled' || s === 'no_show') return status ?? '—'
  return status ?? 'Pending'
}

function statusBadgeClass(status: string | undefined): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'confirmed' || s === 'in_progress') return 'bg-green-100 text-green-800'
  if (s === 'completed') return 'bg-gray-100 text-gray-800'
  if (s === 'cancelled' || s === 'no_show') return 'bg-red-100 text-red-800'
  return 'bg-amber-100 text-amber-800'
}

function statusBorderClass(status: string | undefined): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'confirmed' || s === 'in_progress') return 'border-l-green-500'
  if (s === 'completed') return 'border-l-gray-400'
  if (s === 'cancelled' || s === 'no_show') return 'border-l-red-500'
  return 'border-l-amber-500'
}

export type WorkerShiftAllocation = {
  id: string
  rota_shift_id: string
  status?: string
  shift?: {
    id?: string
    shift_date?: string
    start_time?: string
    end_time?: string
    venue?: { name?: string; address?: string; organisation?: { name?: string } } | null
    role?: { name?: string } | null
  } | null
}

type WorkerShiftCardProps = {
  allocation: WorkerShiftAllocation
  showViewDetails?: boolean
  onViewDetails?: (allocationId: string) => void
}
export default function WorkerShiftCard({ allocation, showViewDetails = true, onViewDetails }: WorkerShiftCardProps) {
  const shift = allocation.shift
  const venue = shift?.venue
  const role = shift?.role
  const orgName = venue?.organisation?.name
  const venueName = venue?.name ?? ''
  const venueLabel = orgName ? `${venueName} – ${orgName}` : venueName
  const address = venue?.address ?? ''
  const roleName = role?.name ?? 'Shift'
  const dateStr = shift?.shift_date
  const start = formatTime(shift?.start_time)
  const end = formatTime(shift?.end_time)
  const dateTimeStr = dateStr ? `${formatShiftDate(dateStr)}, ${start} – ${end}` : `${start} – ${end}`

  return (
    <div
      className={`p-5 bg-white rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-all border-l-4 ${statusBorderClass(allocation.status)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <h3 className="font-bold text-gray-900 text-base">{venueLabel || 'Venue'}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-medium shrink-0 ${statusBadgeClass(allocation.status)}`}>
          {statusLabel(allocation.status)}
        </span>
      </div>
      <p className="text-sm font-semibold text-indigo-600 mb-2">{roleName}</p>
      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400 shrink-0" />
          <span>{dateTimeStr}</span>
        </div>
        {address && (
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <span>{address}</span>
          </div>
        )}
      </div>
      {showViewDetails && allocation.rota_shift_id && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-3">
          {onViewDetails && allocation.id && (
            <button
              type="button"
              onClick={() => onViewDetails(allocation.id)}
              className="px-4 py-2 border-2 border-indigo-600 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-all"
            >
              View details
            </button>
          )}
          <Link
            href={`/employee/clock?shift=${allocation.rota_shift_id}`}
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium hover:shadow-md transition-all inline-block"
          >
            Clock in
          </Link>
        </div>
      )}
    </div>
  )
}
