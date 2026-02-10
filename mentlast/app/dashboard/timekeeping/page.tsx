'use client'

import { useEffect, useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { getPendingTimesheets, approveTimesheet, requestTimesheetEdit } from '@/lib/services/timekeeping'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { supabase } from '@/lib/supabase'

export default function TimekeepingPage() {
  const [timesheets, setTimesheets] = useState<Record<string, unknown>[]>([])
  const [venues, setVenues] = useState<Record<string, unknown>[]>([])
  const [selectedVenue, setSelectedVenue] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedVenue) loadTimesheets()
  }, [selectedVenue])

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const orgId = await getOrganisationIdForCurrentUser()
      if (!orgId) return

      const venuesData = await getVenuesByOrg(orgId)
      setVenues(venuesData as unknown as Record<string, unknown>[])
      if (venuesData.length > 0) {
        setSelectedVenue((venuesData[0] as { id: string }).id)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadTimesheets() {
    if (!selectedVenue) return
    try {
      const data = await getPendingTimesheets(selectedVenue)
      setTimesheets(data)
    } catch (error) {
      console.error('Error loading timesheets:', error)
    }
  }

  async function handleApprove(id: string) {
    try {
      await approveTimesheet(id)
      alert('Timesheet approved.')
      loadTimesheets()
    } catch (error) {
      console.error('Error approving timesheet:', error)
      alert('Failed to approve timesheet')
    }
  }

  async function handleRequestEdit(id: string) {
    const notes = prompt('Enter reason for requesting edit:')
    if (!notes) return
    try {
      await requestTimesheetEdit(id, notes)
      alert('Edit request sent to employee')
      loadTimesheets()
    } catch (error) {
      console.error('Error requesting edit:', error)
      alert('Failed to send edit request')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  return (
    <div>
      <div className="bg-white border-b border-gray-200 sticky top-16 z-10">
        <div className="max-w-5xl mx-auto p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-xl font-bold">Timesheet Approvals</h1>
              <p className="text-sm text-gray-600">{timesheets.length} pending</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Venue</label>
            <select
              value={selectedVenue}
              onChange={(e) => setSelectedVenue(e.target.value)}
              className="w-full md:w-64 border border-gray-300 rounded-lg p-3"
            >
              {venues.map((venue) => (
                <option key={String(venue.id)} value={String(venue.id)}>{String(venue.name)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 mb-6 border border-green-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Timesheets Ready for Approval</h3>
              <p className="text-gray-700 text-sm">
                Review and approve employee hours. These will be included in your payroll.
              </p>
            </div>
          </div>
        </div>

        {timesheets.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-200">
            <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h3>
            <p className="text-gray-600">No pending timesheets to review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timesheets.map((timesheet) => {
              const teamMember = timesheet.team_member as Record<string, unknown> | undefined
              const profile = teamMember?.profile as Record<string, unknown> | undefined
              const shift = timesheet.shift as Record<string, unknown> | undefined
              const shiftRole = shift?.role as Record<string, unknown> | undefined
              const venue = timesheet.venue as Record<string, unknown> | undefined
              return (
                <div
                  key={String(timesheet.id)}
                  className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:border-blue-300 transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 bg-gradient-primary rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg">
                        {(profile?.full_name as string)?.[0] ?? '?'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-gray-900">
                            {(profile?.full_name as string) ?? 'Unknown'}
                          </h3>
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              teamMember?.employment_type === 'full_time'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {teamMember?.employment_type === 'full_time' ? 'FT' : 'PT'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {String(shiftRole?.name ?? '')} • {String(venue?.name ?? '')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {shift?.shift_date
                            ? new Date(String(shift.shift_date)).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })
                            : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">
                        {typeof timesheet.total_hours === 'number'
                          ? timesheet.total_hours.toFixed(2)
                          : '0.00'}{' '}
                        hrs
                      </p>
                      <p className="text-sm text-gray-500">
                        {typeof timesheet.regular_hours === 'number'
                          ? timesheet.regular_hours.toFixed(2)
                          : '0'}{' '}
                        regular
                        {(timesheet.overtime_hours as number) > 0 &&
                          ` + ${(timesheet.overtime_hours as number).toFixed(2)} OT`}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Scheduled</p>
                      <p className="font-medium text-gray-900">
                        {String(shift?.start_time ?? '')} - {String(shift?.end_time ?? '')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Actual</p>
                      <p className="font-medium text-gray-900">
                        {timesheet.clock_in
                          ? new Date(String(timesheet.clock_in)).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}{' '}
                        -{' '}
                        {timesheet.clock_out
                          ? new Date(String(timesheet.clock_out)).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </p>
                    </div>
                  </div>
                  {timesheet.notes != null && String(timesheet.notes) !== '' && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Note:</span> {String(timesheet.notes)}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleApprove(String(timesheet.id))}
                      className="flex-1 px-4 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Approve Timesheet
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRequestEdit(String(timesheet.id))}
                      className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-all"
                    >
                      Request Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
