'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getMyTeamMemberWithRoles } from '@/lib/services/team'
import { getWorkerProfile, getWorkerStats, updateProfilePicture } from '@/lib/services/profile'
import { getOrganisationSettings } from '@/lib/services/settings'
import {
  ProfileHeader,
  StatsCards,
  HierarchySection,
  RolesList,
  DetailsCard,
} from '@/components/profile'

export default function WorkerProfilePage() {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getWorkerProfile>> | null>(null)
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getWorkerStats>> | null>(null)
  const [showRatings, setShowRatings] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserId(user.id)
    const member = await getMyTeamMemberWithRoles(user.id)
    if (!member) {
      setProfile(null)
      setLoading(false)
      return
    }

    const memberId = String((member as { id: string }).id)
    const orgId = String((member as { organisation_id?: string }).organisation_id ?? '')

    const [profileData, statsData, orgSettings] = await Promise.all([
      getWorkerProfile(memberId),
      getWorkerStats(memberId),
      orgId ? getOrganisationSettings(orgId) : Promise.resolve({ show_ratings: true }),
    ])

    setProfile(profileData ?? null)
    setStats(statsData ?? null)
    setShowRatings((orgSettings as { show_ratings?: boolean })?.show_ratings !== false)
    setFullName(profileData?.fullName ?? '')
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave() {
    if (!userId || !fullName.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() || null })
        .eq('id', userId)
      if (error) throw new Error(error.message)
      setProfile((p) => (p ? { ...p, fullName: fullName.trim() } : null))
      setIsEditing(false)
    } catch (e) {
      console.error(e)
      alert('Save failed: ' + (e instanceof Error ? e.message : 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!userId) return
    try {
      const url = await updateProfilePicture(userId, file)
      setProfile((p) => (p ? { ...p, avatarUrl: url } : null))
    } catch (e) {
      alert('Upload failed: ' + (e instanceof Error ? e.message : 'Upload failed'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 mt-4">Loading...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-600 mb-6">You have no organisation membership. Sign in with an invitation.</p>
      </div>
    )
  }

  const hierarchyLevel = profile.hierarchyLevel ?? 'worker'
  const status = profile.status ?? 'active'

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24 space-y-6">
      {/* Edit/Save buttons */}
      <div className="flex justify-end gap-2">
        {!isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Edit Profile
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setIsEditing(false); setFullName(profile.fullName) }}
              className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        )}
      </div>

      {/* Profile Header */}
      <ProfileHeader
        fullName={isEditing ? fullName : profile.fullName}
        email={profile.email}
        memberType="employee"
        avatarUrl={profile.avatarUrl}
        hierarchyLevel={hierarchyLevel}
        isEditing={isEditing}
        onNameChange={isEditing ? setFullName : undefined}
        onAvatarUpload={isEditing ? handleAvatarUpload : undefined}
      />

      {/* Hierarchy & Status (read-only for worker) */}
      <HierarchySection hierarchyLevel={hierarchyLevel} status={status} editable={false} />

      {/* Statistics */}
      <StatsCards
        attendanceRatePercent={stats?.attendanceRatePercent ?? 0}
        averageRating={stats?.averageRating ?? null}
        averageResponseTimeMinutes={stats?.averageResponseTimeMinutes ?? null}
        hoursWorked={stats?.hoursWorked ?? 0}
        showRatings={showRatings}
      />

      {/* Details */}
      <DetailsCard
        employeeId={profile.employeeId}
        joinedDate={
          profile.joinedDate
            ? new Date(profile.joinedDate).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : '—'
        }
      />

      {/* Roles */}
      <RolesList roles={profile.roles} editable={false} />

      {/* Employment status info */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Employment status</p>
        <p>Active = you can be assigned shifts. Inactive = paused (toggle coming later).</p>
      </div>
    </div>
  )
}
