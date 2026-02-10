'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getMyTimekeepingByDateRange } from '@/lib/services/timekeeping'
import { FileText, Download, Calendar, LayoutList } from 'lucide-react'

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatTime(d: unknown): string {
  if (d == null) return '–'
  return new Date(String(d)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function EmployeeTimesheetsPage() {
  const [tab, setTab] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [userId, setUserId] = useState<string | null>(null)
  const [records, setRecords] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - (day === 0 ? 6 : day - 1)
    const mon = new Date(d)
    mon.setDate(diff)
    return mon.toISOString().slice(0, 10)
  })
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    let start: string
    let end: string
    if (tab === 'daily') {
      start = dailyDate
      end = dailyDate
    } else if (tab === 'weekly') {
      start = weekStart
      const endDate = new Date(weekStart)
      endDate.setDate(endDate.getDate() + 6)
      end = endDate.toISOString().slice(0, 10)
    } else {
      start = `${month}-01`
      const lastDay = new Date(parseInt(month.slice(0, 4), 10), parseInt(month.slice(5, 7), 10), 0)
      end = lastDay.toISOString().slice(0, 10)
    }
    getMyTimekeepingByDateRange(userId, start, end)
      .then(setRecords)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [userId, tab, dailyDate, weekStart, month])

  const totalHours = records.reduce((sum, r) => sum + Number(r.total_hours ?? 0), 0)
  const byStatus = records.reduce<Record<string, number>>((acc, r) => {
    const s = String(r.status ?? r.manual_entry_status ?? 'pending')
    const prev = acc[s] ?? 0
    acc[s] = prev + 1
    return acc
  }, {})

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Timesheet reports</h1>
      <p className="text-gray-600 mb-6">View your clock-in/out records and hours by day, week, or month.</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['daily', 'weekly', 'monthly'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg font-medium capitalize ${
              tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t === 'daily' && <LayoutList className="inline w-4 h-4 mr-1.5 -mt-0.5" />}
            {t === 'weekly' && <Calendar className="inline w-4 h-4 mr-1.5 -mt-0.5" />}
            {t === 'monthly' && <Calendar className="inline w-4 h-4 mr-1.5 -mt-0.5" />}
            {t}
          </button>
        ))}
      </div>

      {tab === 'daily' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={dailyDate}
            onChange={(e) => setDailyDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
      )}
      {tab === 'weekly' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Week starting (Monday)</label>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
      )}
      {tab === 'monthly' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
      )}

      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-600">
          Total hours: <strong>{totalHours.toFixed(2)}</strong>
          {Object.keys(byStatus).length > 0 && (
            <span className="ml-2">
              ({Object.entries(byStatus).map(([s, n]) => `${s}: ${n}`).join(', ')})
            </span>
          )}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => alert('Export to PDF/CSV will be available soon.')}
        >
          <Download className="w-4 h-4" />
          Export (PDF/CSV)
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-200">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No timekeeping records in this period.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((r) => {
            const shift = r.shift as Record<string, unknown> | undefined
            const venue = shift?.venue as { name?: string } | undefined
            const role = shift?.role as { name?: string } | undefined
            const status = String(r.manual_entry_status ?? r.status ?? 'pending')
            return (
              <div
                key={String(r.id)}
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 flex flex-wrap justify-between gap-4"
              >
                <div>
                  <p className="font-semibold text-gray-900">{formatDate(String(shift?.shift_date ?? r.clock_in))}</p>
                  <p className="text-sm text-gray-600">{venue?.name ?? '–'} · {role?.name ?? '–'}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatTime(r.clock_in ?? r.actual_clock_in ?? r.proposed_clock_in)} – {formatTime(r.clock_out ?? r.actual_clock_out ?? r.proposed_clock_out)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">{Number(r.total_hours ?? 0).toFixed(2)} hrs</p>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                      status === 'approved' ? 'bg-green-100 text-green-800' :
                      status === 'pending' ? 'bg-amber-100 text-amber-800' :
                      status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
