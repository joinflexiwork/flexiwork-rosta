'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { getTeamMembers } from '@/lib/services/team'
import { generateTimesheet, approveTimesheetDraft } from '@/lib/services/timekeeping'

type PeriodPreset = 'week' | 'twoweek' | 'month'

function getPeriodDates(preset: PeriodPreset): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  if (preset === 'week') {
    start.setDate(end.getDate() - 7)
  } else if (preset === 'twoweek') {
    start.setDate(end.getDate() - 14)
  } else {
    start.setMonth(end.getMonth() - 1)
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export default function GenerateTimesheetPage() {
  const [teamMembers, setTeamMembers] = useState<Record<string, unknown>[]>([])
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('')
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('week')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{
    total_hours: number
    regular_hours: number
    overtime_hours: number
    timesheet_id: string
  } | null>(null)
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const orgId = await getOrganisationIdForCurrentUser()
        if (!orgId) return
        const data = await getTeamMembers(orgId)
        setTeamMembers((data ?? []).filter((m: Record<string, unknown>) => m.status === 'active'))
        if (data?.length) setSelectedWorkerId(String((data[0] as { id: string }).id))
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const { start, end } = getPeriodDates(periodPreset)
    setStartDate(start)
    setEndDate(end)
  }, [periodPreset])

  async function handleGenerate() {
    if (!selectedWorkerId || !startDate || !endDate) return
    setGenerating(true)
    setResult(null)
    try {
      const data = await generateTimesheet({
        workerId: selectedWorkerId,
        startDate,
        endDate,
      })
      if (data.success && data.timesheet_id) {
        setResult({
          total_hours: data.total_hours ?? 0,
          regular_hours: data.regular_hours ?? 0,
          overtime_hours: data.overtime_hours ?? 0,
          timesheet_id: data.timesheet_id,
        })
      }
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Failed to generate timesheet')
    } finally {
      setGenerating(false)
    }
  }

  async function handleApprove() {
    if (!result?.timesheet_id) return
    setApproving(true)
    try {
      const data = await approveTimesheetDraft(result.timesheet_id)
      if (data.success) {
        alert('Timesheet approved.')
        setResult(null)
      } else {
        alert(data.error ?? 'Approval failed')
      }
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Approval failed')
    } finally {
      setApproving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/dashboard/timekeeping?tab=reports"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Back to Timekeeping
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">Generate Timesheet</h1>
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Worker</label>
          <select
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3"
          >
            {teamMembers.map((m) => {
              const profile = m.profile as Record<string, unknown> | undefined
              return (
                <option key={String(m.id)} value={String(m.id)}>
                  {String(profile?.full_name ?? m.email ?? m.id)}
                </option>
              )
            })}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
          <div className="flex gap-2 mb-2">
            {(['week', 'twoweek', 'month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodPreset(p)}
                className={`px-4 py-2 rounded-lg font-medium ${
                  periodPreset === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {p === 'week' ? 'Last 7 days' : p === 'twoweek' ? 'Last 14 days' : 'Last month'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate timesheet'}
        </button>
        {result && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
            <h3 className="font-bold text-green-900">Timesheet generated</h3>
            <p className="text-sm text-green-800">
              Total: {result.total_hours.toFixed(2)} hrs (Regular: {result.regular_hours.toFixed(2)}, OT: {result.overtime_hours.toFixed(2)})
            </p>
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {approving ? 'Approving...' : 'Approve timesheet'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
