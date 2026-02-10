'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getMyTimekeeping } from '@/lib/services/timekeeping'
import { supabase } from '@/lib/supabase'
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'

type TimekeepingRow = Record<string, unknown>

export default function WorkerShiftsPage() {
  const [records, setRecords] = useState<TimekeepingRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const data = await getMyTimekeeping(user.id)
        setRecords(data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return { label: 'Approved', icon: CheckCircle, className: 'text-green-600' }
      case 'rejected':
      case 'disputed':
        return { label: status === 'rejected' ? 'Rejected' : 'Disputed', icon: XCircle, className: 'text-red-600' }
      default:
        return { label: 'Pending approval', icon: AlertCircle, className: 'text-amber-600' }
    }
  }

  const totalHours = records.reduce((sum, r) => sum + (Number(r.total_hours) || 0), 0)
  const approvedCount = records.filter((r) => r.status === 'approved').length

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Shift history</h1>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Total hours (recorded)</div>
          <div className="text-2xl font-bold text-gray-900">{totalHours.toFixed(1)}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600 mb-1">Approved timesheets</div>
          <div className="text-2xl font-bold text-gray-900">{approvedCount}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <h2 className="font-bold text-lg p-4 border-b border-gray-100">Past shifts</h2>
        <div className="divide-y divide-gray-100">
          {records.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No shift records yet.</p>
              <Link href="/worker/dashboard" className="mt-2 inline-block text-blue-600 font-medium text-sm">
                Go to dashboard
              </Link>
            </div>
          ) : (
            records.map((r) => {
              const shift = r.shift as Record<string, unknown> | undefined
              const role = shift?.role as Record<string, unknown> | undefined
              const venue = shift?.venue as Record<string, unknown> | undefined
              const status = statusLabel(String(r.status ?? 'pending'))
              const StatusIcon = status.icon
              return (
                <div key={String(r.id)} className="p-4 flex flex-wrap items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-700">
                    <span className="text-xs font-medium">
                      {shift?.shift_date ? format(parseISO(String(shift.shift_date)), 'MMM') : ''}
                    </span>
                    <span className="text-lg font-bold leading-tight">
                      {shift?.shift_date ? format(parseISO(String(shift.shift_date)), 'd') : ''}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{String(role?.name ?? '')}</div>
                    <div className="text-sm text-gray-600">
                      {String(shift?.start_time ?? '')} – {String(shift?.end_time ?? '')} • {String(venue?.name ?? '')}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm">
                      <StatusIcon className={`w-4 h-4 ${status.className}`} />
                      <span className={status.className}>{status.label}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Hours</div>
                    <div className="font-semibold">{Number(r.total_hours)?.toFixed(1) ?? '—'}</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="mt-6 bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Earnings</p>
        <p>Pay rates and earnings summary will be available in a future update.</p>
      </div>
    </div>
  )
}
