'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  User,
  Camera,
  Building2,
  Bell,
  ChevronLeft,
  Lock,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getProfilePageData, setPrimaryVenue, type ProfilePageData, type HierarchyLevel } from '@/lib/services/profilePage'
import { updateProfilePicture, changePassword } from '@/lib/services/profile'
import { updateMyProfilePersonal, updateOrganisationServer } from '@/app/actions/team-member-actions'
import { getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences } from '@/app/actions/notification-actions'
import { uploadOrganisationLogo } from '@/lib/services/organisations'

const HIERARCHY_LABELS: Record<HierarchyLevel, string> = {
  employer: 'Organization Owner',
  gm: 'General Manager',
  agm: 'Assistant Manager',
  shift_leader: 'Shift Leader',
  worker: 'Worker',
}

const DEFAULT_NOTIF_PREFS: NotificationPreferences = {
  hierarchy_changes: { in_app: true, email: true, push: true },
  shift_changes: { in_app: true, email: false, push: true },
  approvals: { in_app: true, email: true, push: false },
  system_alerts: { in_app: true, email: true, push: false },
}

type TabId = 'personal' | 'organization' | 'notifications'

export default function ProfilePage() {
  const [data, setData] = useState<ProfilePageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('personal')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [personal, setPersonal] = useState({ firstName: '', lastName: '', phone: '' })
  const [orgForm, setOrgForm] = useState({ name: '', company_address: '', tax_id: '' })
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIF_PREFS)
  const [saving, setSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [primaryVenueId, setPrimaryVenueId] = useState<string | null>(null)
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null)

  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      let d = await getProfilePageData()
      if (d && !d.organisationName && d.organisationId) {
        const { data: orgRow } = await supabase
          .from('organisations')
          .select('name')
          .eq('id', d.organisationId)
          .maybeSingle()
        const orgName = (orgRow as { name?: string } | null)?.name ?? ''
        if (orgName) d = { ...d, organisationName: orgName }
      }
      setData(d)
      if (d) {
        setPersonal({
          firstName: d.profile.firstName,
          lastName: d.profile.lastName,
          phone: d.profile.phone ?? '',
        })
        setOrgForm({
          name: d.organisation?.name ?? d.organisationName ?? '',
          company_address: d.organisation?.company_address ?? '',
          tax_id: d.organisation?.tax_id ?? '',
        })
        setAvatarUrl(d.profile.avatarUrl)
        setPrimaryVenueId(d.primaryVenueId)
        setCompanyLogoUrl(d.organisation?.company_logo_url ?? null)
        if (d.organisationId) {
          try {
            const result = await getNotificationPreferences(d.userId, d.organisationId)
            if (result.success && result.data) {
              setNotifPrefs(result.data)
            }
          } catch (e) {
            console.warn('Notification preferences load failed, using defaults:', e)
          }
        }
      }
    } catch (e) {
      console.error(e)
      setToast({ type: 'error', message: 'Failed to load profile' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSavePersonal(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    if (!personal.firstName.trim() || !personal.lastName.trim()) {
      setToast({ type: 'error', message: 'First name and last name are required.' })
      return
    }
    if (!personal.phone.trim()) {
      setToast({ type: 'error', message: 'Phone number is required.' })
      return
    }
    setSaving(true)
    setToast(null)
    try {
      const result = await updateMyProfilePersonal(data.userId, {
        first_name: personal.firstName.trim(),
        last_name: personal.lastName.trim(),
        phone: personal.phone.trim() || null,
      })
      if (!result.success) {
        setToast({ type: 'error', message: result.error ?? 'Failed to save' })
        return
      }
      setToast({ type: 'success', message: 'Profile saved successfully.' })
      load()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveOrganization(e: React.FormEvent) {
    e.preventDefault()
    if (!data?.organisationId || data.hierarchyLevel !== 'employer') return
    setSaving(true)
    setToast(null)
    try {
      const result = await updateOrganisationServer(data.organisationId, {
        name: orgForm.name.trim() || undefined,
        company_address: orgForm.company_address.trim() || undefined,
        tax_id: orgForm.tax_id.trim() || undefined,
      })
      if (!result.success) {
        setToast({ type: 'error', message: result.error ?? 'Failed to save' })
        return
      }
      setToast({ type: 'success', message: 'Profile updated successfully.' })
      load()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveNotifications(e: React.FormEvent) {
    e.preventDefault()
    if (!data?.organisationId) {
      setToast({ type: 'error', message: 'No organisation - cannot save notification preferences.' })
      return
    }
    setSaving(true)
    setToast(null)
    try {
      const result = await updateNotificationPreferences(data.userId, data.organisationId, notifPrefs)
      if (!result.success) {
        setToast({ type: 'error', message: result.error ?? 'Failed to save' })
        return
      }
      setToast({ type: 'success', message: 'Notification preferences saved successfully.' })
      load()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  function updateNotifCategory(
    category: keyof NotificationPreferences,
    channel: 'in_app' | 'email' | 'push',
    value: boolean
  ) {
    if (category === 'quiet_hours_start' || category === 'quiet_hours_end' || category === 'timezone') return
    setNotifPrefs((prev) => ({
      ...prev,
      [category]: { ...prev[category], [channel]: value },
    }))
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !data) return
    setToast(null)
    try {
      const url = await updateProfilePicture(data.userId, file)
      setAvatarUrl(url)
      setToast({ type: 'success', message: 'Profile picture updated.' })
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Upload failed.' })
    }
    e.target.value = ''
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !data?.organisationId) return
    setToast(null)
    try {
      const url = await uploadOrganisationLogo(data.organisationId, file)
      setCompanyLogoUrl(url)
      setToast({ type: 'success', message: 'Company logo updated.' })
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Upload failed.' })
    }
    e.target.value = ''
  }

  async function handlePrimaryVenueChange(venueId: string) {
    if (!data?.teamMemberId) return
    const value = venueId === '' ? null : venueId
    setPrimaryVenueId(value)
    try {
      await setPrimaryVenue(data.teamMemberId, value)
      setToast({ type: 'success', message: 'Primary venue updated.' })
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update' })
      setPrimaryVenueId(data.primaryVenueId)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!data?.profile.email) return
    if (newPassword.length < 6) {
      setToast({ type: 'error', message: 'New password must be at least 6 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setToast({ type: 'error', message: 'New passwords do not match.' })
      return
    }
    setChangingPassword(true)
    setToast(null)
    try {
      await changePassword(data.profile.email, currentPassword, newPassword)
      setToast({ type: 'success', message: 'Password updated successfully.' })
      setPasswordModalOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to change password' })
    } finally {
      setChangingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-600">Loading profile...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-gray-600">Please log in to view your profile.</p>
        <Link href="/dashboard" className="text-purple-600 hover:underline mt-2 inline-block">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const isNewProfile = data.isNewProfile
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'personal', label: 'Personal Info', icon: <User className="w-4 h-4" /> },
    { id: 'organization', label: 'Organization', icon: <Building2 className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-gradient-to-br from-purple-700 via-purple-800 to-purple-900">
      <div className="max-w-3xl mx-auto p-6 pb-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-white hover:text-white/90 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold text-white mb-2">My Profile</h1>
        {isNewProfile ? (
          <p className="text-white/90 mb-6">
            Welcome! Please complete your profile information.
          </p>
        ) : (
          <p className="text-white/90 mb-6">Edit your profile details.</p>
        )}

        {toast && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm ${
              toast.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {toast.message}
          </div>
        )}

        <div className="flex border-b border-white/30 gap-1 mb-6">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors text-white ${
                activeTab === id
                  ? 'border-white'
                  : 'border-transparent text-white/80 hover:text-white'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

      {activeTab === 'personal' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          {isNewProfile && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
              Complete your profile to get started.
            </div>
          )}
          <form onSubmit={handleSavePersonal} className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="block rounded-full overflow-hidden w-24 h-24 bg-gray-200 focus:ring-2 focus:ring-purple-500"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center">
                      <User className="w-10 h-10 text-gray-400" />
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shadow"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={personal.firstName}
                    onChange={(e) => setPersonal((p) => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={personal.lastName}
                    onChange={(e) => setPersonal((p) => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    required
                  />
                </div>
              </div>
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={data.profile.email}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed (used for login).</p>
              </div>
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  value={personal.phone}
                  onChange={(e) => setPersonal((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                  required
                />
              </div>
              <div className="w-full">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Lock className="w-4 h-4" />
                  Change Password
                </button>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Position &amp; Hierarchy</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Current Position</p>
                  <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    {data.hierarchyLevel === 'employer' ? 'Organization Owner' :
                     data.hierarchyLevel === 'gm' ? 'General Manager' :
                     data.hierarchyLevel === 'agm' ? 'Assistant Manager' :
                     data.hierarchyLevel === 'shift_leader' ? 'Shift Leader' : 'Worker'}
                  </span>
                </div>
                <div>
                  <p className="text-gray-500">Organization</p>
                  <p className="font-medium text-gray-900 mt-1">{data.organisationName || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Primary Venue</p>
                  <div className="mt-1">
                    {data.hierarchyLevel === 'employer' ? (
                      <span className="text-gray-700">All Venues</span>
                    ) : data.venues.length > 0 ? (
                      <select
                        value={primaryVenueId ?? ''}
                        onChange={(e) => handlePrimaryVenueChange(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-900"
                      >
                        <option value="">— Select —</option>
                        {data.venues.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-gray-500">Reporting To</p>
                  <p className="font-medium text-gray-900 mt-1">{data.reportingTo || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Member Since</p>
                  <p className="text-gray-900 mt-1">
                    {data.memberSince
                      ? new Date(data.memberSince).toLocaleDateString('en-GB', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
              </div>
            </div>

            {data.hierarchyLevel === 'employer' && (
              <section className="border-t border-gray-100 pt-4 mt-4 team-management">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Team Management</h3>
                <p className="text-sm text-gray-600 mb-3">
                  As Organization Owner, you can edit all team member profiles.
                </p>
                <Link
                  href="/dashboard/team"
                  className="inline-flex items-center gap-1 text-sm font-medium text-purple-600 hover:text-purple-700"
                >
                  Manage Team Profiles →
                </Link>
              </section>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : isNewProfile ? 'Save Profile' : 'Save'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'organization' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          {data.hierarchyLevel === 'employer' && data.organisationId ? (
            <form onSubmit={handleSaveOrganization} className="space-y-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  {companyLogoUrl ? (
                    <img
                      src={companyLogoUrl}
                      alt="Company logo"
                      className="w-20 h-20 rounded-lg object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-lg border border-gray-200 flex items-center justify-center bg-gray-50">
                      <Building2 className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm((o) => ({ ...o, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                  />
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Address</label>
                  <textarea
                    value={orgForm.company_address}
                    onChange={(e) => setOrgForm((o) => ({ ...o, company_address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                    rows={3}
                  />
                </div>
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID / Registration Number</label>
                  <input
                    type="text"
                    value={orgForm.tax_id}
                    onChange={(e) => setOrgForm((o) => ({ ...o, tax_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                  />
                </div>
                <div className="w-full space-y-1 text-sm">
                  <p className="text-gray-700">
                    <span className="font-medium">Subscription Status:</span>{' '}
                    <span className="text-green-700 font-medium">Active</span>
                  </p>
                  <p className="text-gray-500">Renew date: —</p>
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600">Organization details are managed by the organization owner.</p>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">Organization</dt>
                  <dd className="font-medium text-gray-900">{data.organisationName || '—'}</dd>
                </div>
                {data.organisation && (
                  <>
                    <div>
                      <dt className="text-gray-500">Address</dt>
                      <dd className="text-gray-900">{data.organisation.company_address || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Tax ID</dt>
                      <dd className="text-gray-900">{data.organisation.tax_id || '—'}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
          {!data?.organisationId ? (
            <p className="text-gray-600">Join an organisation to manage notification preferences.</p>
          ) : (
            <form onSubmit={handleSaveNotifications} className="space-y-6">
              {/* Hierarchy Changes */}
              <div className="border border-gray-100 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-1">Hierarchy & Team Changes</h3>
                <p className="text-sm text-gray-500 mb-4">Promotions, demotions, new team members</p>
                <div className="space-y-2">
                  {(['in_app', 'email', 'push'] as const).map((ch) => (
                    <label key={ch} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-700">
                        {ch === 'in_app' ? 'In-app' : ch === 'email' ? 'Email' : 'Push'} notifications
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notifPrefs.hierarchy_changes[ch]}
                        onClick={() => updateNotifCategory('hierarchy_changes', ch, !notifPrefs.hierarchy_changes[ch])}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                          notifPrefs.hierarchy_changes[ch] ? 'bg-purple-600' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${notifPrefs.hierarchy_changes[ch] ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>

              {/* Shift Changes */}
              <div className="border border-gray-100 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-1">Shift Updates</h3>
                <p className="text-sm text-gray-500 mb-4">New shifts, reassignments, cancellations</p>
                <div className="space-y-2">
                  {(['in_app', 'email', 'push'] as const).map((ch) => (
                    <label key={ch} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-700">
                        {ch === 'in_app' ? 'In-app' : ch === 'email' ? 'Email' : 'Push'} notifications
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notifPrefs.shift_changes[ch]}
                        onClick={() => updateNotifCategory('shift_changes', ch, !notifPrefs.shift_changes[ch])}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                          notifPrefs.shift_changes[ch] ? 'bg-purple-600' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${notifPrefs.shift_changes[ch] ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>

              {/* Approvals */}
              <div className="border border-gray-100 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-1">Approvals & Requests</h3>
                <p className="text-sm text-gray-500 mb-4">Timesheets, leave requests, swaps</p>
                <div className="space-y-2">
                  {(['in_app', 'email', 'push'] as const).map((ch) => (
                    <label key={ch} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-700">
                        {ch === 'in_app' ? 'In-app' : ch === 'email' ? 'Email' : 'Push'} notifications
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notifPrefs.approvals[ch]}
                        onClick={() => updateNotifCategory('approvals', ch, !notifPrefs.approvals[ch])}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                          notifPrefs.approvals[ch] ? 'bg-purple-600' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${notifPrefs.approvals[ch] ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>

              {/* System Alerts */}
              <div className="border border-gray-100 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-1">System Alerts</h3>
                <p className="text-sm text-gray-500 mb-4">Security, subscription, critical updates</p>
                <div className="space-y-2">
                  {(['in_app', 'email'] as const).map((ch) => (
                    <label key={ch} className="flex items-center justify-between py-1">
                      <span className="text-sm text-gray-700">
                        {ch === 'in_app' ? 'In-app' : 'Email'} notifications
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={notifPrefs.system_alerts[ch]}
                        onClick={() => updateNotifCategory('system_alerts', ch, !notifPrefs.system_alerts[ch])}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                          notifPrefs.system_alerts[ch] ? 'bg-purple-600' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${notifPrefs.system_alerts[ch] ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </form>
          )}
        </div>
      )}

      </div>

      {passwordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Change Password</h2>
              <button
                type="button"
                onClick={() => {
                  setPasswordModalOpen(false)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={changingPassword}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {changingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

