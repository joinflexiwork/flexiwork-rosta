'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Star,
  Clock,
  Zap,
  Lock,
  Upload,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Hash,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getMyTeamMemberWithRoles } from '@/lib/services/team'
import { getOrganisationSettings } from '@/lib/services/settings'
import {
  getWorkerProfile,
  getWorkerStats,
  updateProfilePicture,
  type WorkerProfileData,
  type WorkerStats,
} from '@/lib/services/profile'

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1 && parts[0].length >= 1) return parts[0].slice(0, 2).toUpperCase()
  return '?'
}

function formatHours(hours: number): string {
  return hours.toLocaleString('en-GB', { maximumFractionDigits: 0, minimumFractionDigits: 0 })
}

function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function EmployeeProfilePage() {
  const [profile, setProfile] = useState<WorkerProfileData | null>(null)
  const [stats, setStats] = useState<WorkerStats | null>(null)
  const [showRatings, setShowRatings] = useState(true)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const teamData = await getMyTeamMemberWithRoles(user.id)
    if (!teamData) {
      setLoading(false)
      return
    }
    const teamMemberId = (teamData as { id: string }).id
    const orgId = (teamData as { organisation_id?: string }).organisation_id ?? ''
    const [profileData, statsData, orgSettings] = await Promise.all([
      getWorkerProfile(teamMemberId),
      getWorkerStats(teamMemberId),
      orgId ? getOrganisationSettings(orgId) : Promise.resolve({ show_ratings: true }),
    ])
    setProfile(profileData ?? null)
    setStats(statsData ?? null)
    setShowRatings(orgSettings.show_ratings !== false)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile?.userId) return
    setUploadError(null)
    setUploadProgress('Uploading...')
    setUploading(true)
    try {
      const url = await updateProfilePicture(profile.userId, file)
      setProfile((prev) => (prev ? { ...prev, avatarUrl: url } : null))
      setUploadProgress('Saved!')
      setTimeout(() => setUploadProgress(null), 2000)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
      setUploadProgress(null)
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 mt-4">Loading profile...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-600 mb-6">You are not linked to a team yet. Accept an invite to see your profile.</p>
        <Link
          href="/employee/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium"
        >
          Back to Dashboard
        </Link>
      </div>
    )
  }

  const initials = getInitials(profile.fullName)

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header: avatar + name + email */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 h-24" />
        <div className="px-6 pb-6 -mt-12 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={uploading}
              className="relative flex-shrink-0 w-24 h-24 rounded-2xl border-4 border-white shadow-lg overflow-hidden bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-700"
            >
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="object-cover w-full h-full"
                />
              ) : (
                initials
              )}
              <span className="absolute bottom-0 right-0 left-0 py-1 bg-black/50 text-white text-xs flex items-center justify-center gap-1">
                <Upload className="w-3 h-3" /> Upload
              </span>
            </button>
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-xl font-bold text-gray-900">{profile.fullName || 'No name'}</h1>
              <p className="text-gray-600 flex items-center justify-center sm:justify-start gap-1 mt-0.5">
                <Mail className="w-4 h-4 text-gray-400" />
                {profile.email || '—'}
              </p>
              {uploadProgress && (
                <p className="text-sm text-indigo-600 mt-1">{uploadProgress}</p>
              )}
              {uploadError && (
                <p className="text-sm text-red-600 mt-1">{uploadError}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats: 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.attendanceRatePercent ?? 0}%</p>
          <p className="text-sm text-gray-500">Attendance Rate</p>
          <p className="text-xs text-gray-400 mt-0.5">Last 30 days</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
            {showRatings ? (
              <Star className="w-5 h-5 text-amber-600" />
            ) : (
              <Lock className="w-5 h-5 text-gray-500" />
            )}
          </div>
          {showRatings && stats?.averageRating != null ? (
            <>
              <p className="text-2xl font-bold text-gray-900">{stats.averageRating.toFixed(1)}</p>
              <p className="text-sm text-gray-500">Average Rating</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-600">Ratings hidden</p>
              <p className="text-xs text-gray-500">by employer</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {stats?.averageResponseTimeMinutes != null
              ? formatResponseTime(stats.averageResponseTimeMinutes)
              : 'N/A'}
          </p>
          <p className="text-sm text-gray-500">Avg Response Time</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-3">
            <Zap className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatHours(stats?.hoursWorked ?? 0)}</p>
          <p className="text-sm text-gray-500">Hours Worked</p>
          <p className="text-xs text-gray-400 mt-0.5">Approved only</p>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Details</h2>
        <ul className="space-y-3">
          {profile.phone && (
            <li className="flex items-center gap-3 text-gray-700">
              <Phone className="w-5 h-5 text-gray-400" />
              {profile.phone}
            </li>
          )}
          {profile.primaryVenue && (
            <li className="flex items-center gap-3 text-gray-700">
              <MapPin className="w-5 h-5 text-gray-400" />
              {profile.primaryVenue.name}
              {profile.primaryVenue.address && (
                <span className="text-gray-500 text-sm"> · {profile.primaryVenue.address}</span>
              )}
            </li>
          )}
          {profile.joinedDate && (
            <li className="flex items-center gap-3 text-gray-700">
              <Calendar className="w-5 h-5 text-gray-400" />
              Joined {new Date(profile.joinedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </li>
          )}
          <li className="flex items-center gap-3 text-gray-700">
            <Hash className="w-5 h-5 text-gray-400" />
            Employee ID: {profile.employeeId}
          </li>
        </ul>
      </div>

      {/* Skills & certifications */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">My Roles & Skills</h2>
        <div className="flex flex-wrap gap-2">
          {profile.roles.length === 0 && profile.certifications.length === 0 ? (
            <p className="text-gray-500 text-sm">No skills assigned yet.</p>
          ) : (
            <>
              {profile.roles.map((role) => (
                <span
                  key={role.id}
                  className="px-4 py-2 rounded-full text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
                >
                  {role.name}
                </span>
              ))}
              {profile.certifications.map((cert, idx) => (
                <span
                  key={idx}
                  className="px-4 py-2 rounded-full text-sm font-medium bg-purple-50 text-purple-700 border border-purple-100"
                >
                  {typeof cert === 'string' ? cert : String(cert)}
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <Link
          href="/employee/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
