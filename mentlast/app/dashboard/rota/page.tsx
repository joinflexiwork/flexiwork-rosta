'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Users, Plus, X } from 'lucide-react'
import { getWeeklyRota, createRotaShift, publishRotaWeek } from '@/lib/services/rota'
import { allocateEmployee } from '@/lib/services/allocations'
import { inviteEmployeesToShift } from '@/lib/services/invites'
import { getRolesByOrg } from '@/lib/services/roles'
import { getVenuesByOrg } from '@/lib/services/venues'
import { getTeamMembers } from '@/lib/services/team'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { supabase } from '@/lib/supabase'

function getMonday(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return date.toISOString().split('T')[0]
}

export default function RotaPage() {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [selectedVenue, setSelectedVenue] = useState<string>('')
  const [venues, setVenues] = useState<Record<string, unknown>[]>([])
  const [roles, setRoles] = useState<Record<string, unknown>[]>([])
  const [shifts, setShifts] = useState<Record<string, unknown>[]>([])
  const [organisationId, setOrganisationId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAllocateModal, setShowAllocateModal] = useState(false)
  const [selectedShift, setSelectedShift] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedVenue) loadWeeklyRota()
  }, [selectedVenue, weekStart])

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const orgId = await getOrganisationIdForCurrentUser()
      if (!orgId) return
      setOrganisationId(orgId)

      const [rolesData, venuesData] = await Promise.all([
        getRolesByOrg(orgId),
        getVenuesByOrg(orgId),
      ])
      setRoles(rolesData as unknown as Record<string, unknown>[])
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

  async function loadWeeklyRota() {
    if (!selectedVenue) return
    try {
      const rotaData = await getWeeklyRota({
        venue_id: selectedVenue,
        week_start: weekStart,
      })
      setShifts(rotaData as unknown as Record<string, unknown>[])
    } catch (error) {
      console.error('Error loading rota:', error)
    }
  }

  function prevWeek() {
    const date = new Date(weekStart)
    date.setDate(date.getDate() - 7)
    setWeekStart(date.toISOString().split('T')[0])
  }

  function nextWeek() {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + 7)
    setWeekStart(date.toISOString().split('T')[0])
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading rota...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="bg-white border-b border-gray-200 sticky top-16 z-10">
        <div className="max-w-7xl mx-auto p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Create Roster</h1>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              + Add Shift
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!selectedVenue) {
                  alert('Please select a venue first')
                  return
                }
                try {
                  const { publishedCount } = await publishRotaWeek(selectedVenue, weekStart)
                  alert(`Roster published successfully! ${publishedCount} shift(s) updated.`)
                  loadWeeklyRota()
                } catch (error: unknown) {
                  alert('Failed to publish: ' + (error instanceof Error ? error.message : String(error)))
                }
              }}
              className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg font-medium"
            >
              Publish Roster
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <h2 className="text-lg font-bold mb-4">Roster Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Venue</label>
              <select
                value={selectedVenue}
                onChange={(e) => setSelectedVenue(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
              >
                {venues.map((venue) => (
                  <option key={String(venue.id)} value={String(venue.id)}>{String(venue.name)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Week Starting</label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Weekly Calendar View</h2>
              <div className="flex gap-2">
                <button type="button" onClick={prevWeek} className="p-2 hover:bg-white rounded-lg border border-gray-200">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button type="button" onClick={nextWeek} className="p-2 hover:bg-white rounded-lg border border-gray-200">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-4 font-semibold text-gray-700 border-r border-gray-200 w-32">Date</th>
                  {days.map((day, idx) => {
                    const date = new Date(weekStart)
                    date.setDate(date.getDate() + idx)
                    return (
                      <th
                        key={idx}
                        className="text-center p-4 font-semibold text-gray-700 border-r border-gray-200 last:border-r-0 min-w-[140px]"
                      >
                        <div>{day}</div>
                        <div className="text-xs font-normal text-gray-500">
                          {date.getDate()} {date.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="p-4 font-medium text-gray-700 border-r border-gray-200 align-top">All shifts</td>
                  {days.map((_, dayIdx) => {
                    const date = new Date(weekStart)
                    date.setDate(date.getDate() + dayIdx)
                    const dateStr = date.toISOString().split('T')[0]
                    const dayShifts = shifts.filter((s) => s.shift_date === dateStr) as Record<string, unknown>[]
                    return (
                      <td key={dayIdx} className="p-2 border-r border-gray-200 last:border-r-0 align-top">
                        <div className="space-y-2 min-h-[80px]">
                          {dayShifts.map((shift) => {
                            const filled = Number(shift.headcount_filled ?? 0)
                            const needed = Number(shift.headcount_needed ?? 1)
                            const role = shift.role as Record<string, unknown> | undefined
                            return (
                              <div
                                key={String(shift.id)}
                                onClick={() => {
                                  setSelectedShift(shift)
                                  setShowAllocateModal(true)
                                }}
                                className={`rounded-lg p-3 cursor-pointer border ${
                                  filled >= needed ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-300 border-dashed'
                                }`}
                              >
                                <div className="text-center">
                                  <div className={`font-bold ${filled >= needed ? 'text-blue-700' : 'text-amber-700'}`}>
                                    {filled}/{needed}
                                  </div>
                                  <div className="text-xs text-gray-600">{String(role?.name ?? '')}</div>
                                  <div className="text-xs text-gray-500">
                                    {String(shift.start_time)}–{String(shift.end_time)}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() => setShowCreateModal(true)}
                            className="w-full py-2 text-gray-400 hover:bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-gradient-primary rounded-xl p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-2">Unfilled Shifts? Send to Gig Platform</h3>
              <p className="text-blue-100 mb-4">Enable automatic posting (Coming in Phase 2)</p>
              <button type="button" disabled className="px-6 py-2 bg-white/20 text-white rounded-lg opacity-50 cursor-not-allowed">
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateShiftModal
          venueId={selectedVenue}
          roles={roles}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            loadWeeklyRota()
          }}
        />
      )}

      {showAllocateModal && selectedShift && (
        <AllocateShiftModal
          shift={selectedShift}
          organisationId={organisationId}
          onClose={() => {
            setShowAllocateModal(false)
            setSelectedShift(null)
          }}
          onSuccess={() => {
            setShowAllocateModal(false)
            setSelectedShift(null)
            loadWeeklyRota()
          }}
        />
      )}
    </div>
  )
}

function CreateShiftModal({
  venueId,
  roles,
  onClose,
  onSuccess,
}: {
  venueId: string
  roles: Record<string, unknown>[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    role_id: (roles[0] as { id: string })?.id ?? '',
    shift_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '17:00',
    headcount_needed: 1,
    notes: '',
  })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!venueId) return
    setLoading(true)
    try {
      await createRotaShift({
        venue_id: venueId,
        role_id: formData.role_id,
        shift_date: formData.shift_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        headcount_needed: formData.headcount_needed,
        notes: formData.notes || undefined,
      })
      onSuccess()
    } catch (error) {
      console.error('Error creating shift:', error)
      alert('Failed to create shift')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold">Create New Shift</h2>
          <button type="button" onClick={onClose}><X className="w-6 h-6" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Role *</label>
            <select
              value={formData.role_id}
              onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
              className="w-full border rounded-lg p-3"
            >
              {roles.map((role) => (
                <option key={String(role.id)} value={String(role.id)}>{String(role.name)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Date *</label>
            <input
              type="date"
              value={formData.shift_date}
              onChange={(e) => setFormData({ ...formData, shift_date: e.target.value })}
              className="w-full border rounded-lg p-3"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Start *</label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full border rounded-lg p-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">End *</label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full border rounded-lg p-3"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Headcount *</label>
            <input
              type="number"
              min={1}
              value={formData.headcount_needed}
              onChange={(e) => setFormData({ ...formData, headcount_needed: parseInt(e.target.value, 10) || 1 })}
              className="w-full border rounded-lg p-3"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-3 border rounded-lg">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-lg">
              {loading ? 'Creating...' : 'Create Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AllocateShiftModal({
  shift,
  organisationId,
  onClose,
  onSuccess,
}: {
  shift: Record<string, unknown>
  organisationId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [employees, setEmployees] = useState<Record<string, unknown>[]>([])
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'allocate' | 'invite'>('allocate')
  const [inviteResult, setInviteResult] = useState<{ shift: Record<string, unknown>; invites: { invite_code: string; team_member_id: string }[] } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getTeamMembers(organisationId)
        setEmployees(data.filter((e: Record<string, unknown>) => e.status === 'active'))
      } catch (error) {
        console.error('Error loading employees:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [organisationId])

  const ftEmployees = employees.filter((e) => e.employment_type === 'full_time')
  const ptEmployees = employees.filter((e) => e.employment_type === 'part_time')
  const role = shift.role as Record<string, unknown> | undefined

  async function handleAllocate() {
    try {
      for (const employeeId of selectedEmployees) {
        await allocateEmployee({
          rota_shift_id: String(shift.id),
          team_member_id: employeeId,
        })
      }
      alert('Employees allocated successfully')
      onSuccess()
    } catch (error) {
      console.error('Error allocating:', error)
      alert('Failed to allocate employees')
    }
  }

  async function handleInvite() {
    try {
      const created = await inviteEmployeesToShift({
        rota_shift_id: String(shift.id),
        team_member_ids: selectedEmployees,
      })
      const withCodes = created
        .filter((inv) => (inv as { invite_code?: string }).invite_code)
        .map((inv) => ({ invite_code: (inv as { invite_code: string }).invite_code, team_member_id: String((inv as { team_member_id: string }).team_member_id) }))
      if (withCodes.length > 0) {
        setInviteResult({ shift, invites: withCodes })
      } else {
        alert(`Invites sent to ${selectedEmployees.length} employees`)
        onSuccess()
      }
    } catch (error) {
      console.error('Error sending invites:', error)
      alert('Failed to send invites')
    }
  }

  function closeInviteResult() {
    setInviteResult(null)
    onSuccess()
  }

  const venue = shift.venue as { name?: string; address?: string } | undefined
  const creator = shift.creator as { full_name?: string } | undefined
  const baseUrl =
    (typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)) ||
    'http://localhost:3000'

  function formatTime(t: string) {
    const [h, m] = (String(t || '').split(':'))
    const hh = parseInt(h ?? '0', 10)
    const ampm = hh >= 12 ? 'PM' : 'AM'
    const h12 = hh % 12 || 12
    return `${h12}:${(m ?? '00').slice(0, 2)} ${ampm}`
  }

  if (inviteResult) {
    const { invites: createdInvites } = inviteResult
    const roleName = String(role?.name ?? '')
    const venueName = String(venue?.name ?? '')
    const venueAddress = String(venue?.address ?? '').trim()
    const managerName = String(creator?.full_name ?? 'Your manager')
    const shiftDate = String(inviteResult.shift.shift_date)
    const startTime = formatTime(String(inviteResult.shift.start_time))
    const endTime = formatTime(String(inviteResult.shift.end_time))
    const dateFormatted = new Date(shiftDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })

    const body = `Hi!

You've been invited to work a shift:

📍 Venue: ${venueName}
${venueAddress ? `📍 Address: ${venueAddress}\n` : ''}🕐 Date: ${dateFormatted}
⏰ Time: ${startTime} - ${endTime}
💼 Role: ${roleName}
👨‍💼 Manager: ${managerName}

To accept this offer:
• Open FlexiWork app (Expo Go) on your phone
• Tap "Register" and use the email below
• Enter the invite code below (or open the link)

Invite code: {CODE}
OR visit: {LINK}

This offer expires in 48 hours.

— FlexiWork Rosta`

    const lines: string[] = []
    createdInvites.forEach((inv) => {
      const emp = employees.find((e) => String(e.id) === inv.team_member_id) as { profile?: { email?: string }; email?: string } | undefined
      const workerEmail = emp?.profile?.email ?? emp?.email ?? '(worker email)'
      const link = `${baseUrl}/invite/${inv.invite_code}`
      const workerMessage = body.replace('{CODE}', inv.invite_code).replace('{LINK}', link)
      lines.push(`--- Send to: ${workerEmail} ---`)
      lines.push(workerMessage)
      lines.push('')
    })

    const message = `Subject: Job Offer - ${roleName} at ${venueName}

Copy the block below for each worker (each has a unique code and link):

${lines.join('\n').trim()}

Unique links:
${createdInvites.map((inv) => `${baseUrl}/invite/${inv.invite_code}`).join('\n')}`
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-bold">Share invite links</h2>
            <button type="button" onClick={closeInviteResult}><X className="w-6 h-6" /></button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Copy the message below and send it to each worker (e.g. by email or message). Each link shows the shift details and how to accept.
            </p>
            <textarea
              readOnly
              value={message}
              rows={24}
              className="w-full border rounded-lg p-3 text-sm font-mono bg-gray-50"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(message); alert('Copied to clipboard') }}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium"
              >
                Copy to clipboard
              </button>
              <button type="button" onClick={closeInviteResult} className="flex-1 px-6 py-3 border rounded-lg">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold">Fill Shift</h2>
            <p className="text-sm text-gray-600">
              {String(role?.name ?? '')} • {String(shift.shift_date)} • {String(shift.start_time)}–{String(shift.end_time)}
            </p>
          </div>
          <button type="button" onClick={onClose}><X className="w-6 h-6" /></button>
        </div>
        <div className="p-6 border-b border-gray-200">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setView('allocate')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium ${view === 'allocate' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
            >
              Allocate FT ({ftEmployees.length})
            </button>
            <button
              type="button"
              onClick={() => setView('invite')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium ${view === 'invite' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}
            >
              Invite PT ({ptEmployees.length})
            </button>
          </div>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">Loading employees...</div>
          ) : (
            <div className="space-y-2">
              {(view === 'allocate' ? ftEmployees : ptEmployees).map((employee) => {
                const profile = employee.profile as Record<string, unknown> | undefined
                const primaryVenue = employee.primary_venue as Record<string, unknown> | undefined
                return (
                  <label
                    key={String(employee.id)}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmployees.includes(String(employee.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEmployees([...selectedEmployees, String(employee.id)])
                        } else {
                          setSelectedEmployees(selectedEmployees.filter((id) => id !== employee.id))
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold">
                      {(profile?.full_name as string)?.[0] ?? '?'}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{String(profile?.full_name ?? '')}</div>
                      <div className="text-sm text-gray-500">{String(primaryVenue?.name ?? '')}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
          <div className="flex gap-3 mt-6">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-3 border rounded-lg">Cancel</button>
            <button
              type="button"
              onClick={view === 'allocate' ? handleAllocate : handleInvite}
              disabled={selectedEmployees.length === 0}
              className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-lg disabled:opacity-50"
            >
              {view === 'allocate' ? `Allocate ${selectedEmployees.length}` : `Invite ${selectedEmployees.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
