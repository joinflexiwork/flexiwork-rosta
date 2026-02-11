'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Calendar } from 'lucide-react'
import { getWorkerShiftsForDetail } from '@/app/actions/shifts'
import { getTeamMemberWithRoles } from '@/lib/services/team'

export default function WorkerShiftsPage() {
  const params = useParams()
  const id = params?.id as string
  const [workerName, setWorkerName] = useState<string>('')
  const [shifts, setShifts] = useState<{ shift_date: string; start_time: string; end_time: string; venue_name: string; role_name: string; status?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const member = await getTeamMemberWithRoles(id)
        if (!member?.organisation_id || cancelled) return
        const profile = member.profile as { full_name?: string } | undefined
        setWorkerName(profile?.full_name ?? (member.email as string) ?? 'Worker')
        const result = await getWorkerShiftsForDetail(id, String(member.organisation_id))
        if (cancelled) return
        if (result.error) {
          setError(result.error)
          return
        }
        setShifts(result.shifts ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load shifts')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-6">
      <div className="flex items-center gap-4 mb-4">
        <Link
          href={`/dashboard/workers/${id}`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Back to profile
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-6 h-6 text-indigo-600" />
          Shifts {workerName ? `– ${workerName}` : ''}
        </h1>

        {loading && <p className="text-gray-500">Loading...</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {!loading && !error && shifts.length === 0 && (
          <p className="text-gray-500">No shifts.</p>
        )}
        {!loading && !error && shifts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Start</th>
                  <th className="py-2 pr-4 font-medium">End</th>
                  <th className="py-2 pr-4 font-medium">Venue</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s, i) => {
                  const dateStr = s.shift_date ? new Date(s.shift_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'
                  const start = (s.start_time || '').slice(0, 5) || '—'
                  const end = (s.end_time || '').slice(0, 5) || '—'
                  return (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4 font-medium text-gray-900">{dateStr}</td>
                      <td className="py-3 pr-4 text-gray-600">{start}</td>
                      <td className="py-3 pr-4 text-gray-600">{end}</td>
                      <td className="py-3 pr-4 text-gray-600">{s.venue_name || '—'}</td>
                      <td className="py-3 pr-4 text-gray-600">{s.role_name || '—'}</td>
                      <td className="py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                          s.status === 'completed' ? 'bg-green-100 text-green-800' :
                          s.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          s.status === 'confirmed' || s.status === 'allocated' ? 'bg-amber-100 text-amber-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {s.status || '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
