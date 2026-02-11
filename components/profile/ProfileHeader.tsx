'use client'

import { Mail } from 'lucide-react'

const POSITION_LABELS: Record<string, string> = {
  worker: 'Worker',
  shift_leader: 'Shift Leader',
  agm: 'AGM',
  gm: 'GM',
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1 && parts[0].length >= 1) return parts[0].slice(0, 2).toUpperCase()
  return '?'
}

export interface ProfileHeaderProps {
  fullName: string
  email: string
  memberType?: string
  avatarUrl?: string | null
  hierarchyLevel?: string
  isEditing?: boolean
  onNameChange?: (value: string) => void
  onAvatarUpload?: (file: File) => void | Promise<void>
}

export function ProfileHeader({
  fullName,
  email,
  memberType = 'employee',
  avatarUrl,
  hierarchyLevel,
  isEditing = false,
  onNameChange,
  onAvatarUpload,
}: ProfileHeaderProps) {
  const initials = getInitials(fullName || '?')

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 h-32 flex flex-col justify-end">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 px-6 pb-4">
          <div className="flex-shrink-0 relative">
            {avatarUrl ? (
              <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg overflow-hidden">
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="object-cover w-full h-full"
                />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-700">
                {initials}
              </div>
            )}
            {isEditing && onAvatarUpload && (
              <label className="absolute bottom-0 right-0 bg-white rounded-full p-1.5 cursor-pointer shadow-lg hover:bg-gray-50">
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onAvatarUpload(file)
                  }}
                />
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </label>
            )}
          </div>
          <div className="flex-1 w-full min-w-0">
            {isEditing && onNameChange ? (
              <input
                type="text"
                value={fullName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Full name"
                className="w-full bg-transparent border-b-2 border-white/40 text-white text-2xl sm:text-3xl font-bold placeholder-white/70 focus:outline-none focus:border-white pb-1"
              />
            ) : (
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{fullName || '—'}</h1>
            )}
            {hierarchyLevel && (
              <p className="text-sm text-white/75 mt-0.5">
                {POSITION_LABELS[hierarchyLevel] ?? hierarchyLevel}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="px-6 pb-6 -mt-12 relative pt-14 space-y-1">
        <p className="text-gray-700 flex items-center gap-2">
          <Mail className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="font-medium text-gray-900">{email}</span>
        </p>
        <p className="text-sm text-gray-500">Type: {memberType}</p>
      </div>
    </div>
  )
}
