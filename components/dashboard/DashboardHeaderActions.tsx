'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Settings, User, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import NotificationBell from '@/components/NotificationBell'
import SettingsModal from './SettingsModal'

export default function DashboardHeaderActions() {
  const router = useRouter()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ fullName: string; email: string; avatarUrl: string | null } | null>(null)
  const [organisationName, setOrganisationName] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setOrganisationName(null)
      return
    }
    supabase
      .from('profiles')
      .select('full_name, email, avatar_url')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setProfile({ fullName: '', email: '', avatarUrl: null })
          return
        }
        const row = data as { full_name?: string; email?: string; avatar_url?: string | null }
        setProfile({
          fullName: row.full_name ?? '',
          email: row.email ?? '',
          avatarUrl: row.avatar_url ?? null,
        })
      })
    // Organisation name for employer dashboard header
    supabase
      .from('organisations')
      .select('name')
      .eq('owner_id', userId)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setOrganisationName((data as { name?: string } | null)?.name ?? null)
      })
  }, [userId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function openSettings() {
    setDropdownOpen(false)
    setSettingsModalOpen(true)
  }

  async function handleLogout() {
    setDropdownOpen(false)
    await supabase.auth.signOut()
    router.replace('/auth/login')
  }

  return (
    <div className="flex items-center gap-2">
      <NotificationBell />
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-2 p-1 pr-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
          aria-label="Profile menu"
        >
          <span className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-4 h-4 text-gray-500" />
            )}
          </span>
        </button>
        {dropdownOpen && (
          <div className="absolute right-0 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg py-2 z-50">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="font-medium text-gray-900 truncate">{organisationName || profile?.fullName || 'User'}</p>
              {organisationName && (profile?.fullName || profile?.email) && (
                <p className="text-sm text-gray-600 truncate">{profile?.fullName || profile?.email || ''}</p>
              )}
              {!organisationName && <p className="text-sm text-gray-600 truncate">{profile?.email || ''}</p>}
            </div>
            <Link
              href="/dashboard/profile"
              onClick={() => setDropdownOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <User className="w-4 h-4 text-gray-500" />
              My Profile
            </Link>
            <button
              type="button"
              onClick={openSettings}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings className="w-4 h-4 text-gray-500" />
              Settings
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        )}
      </div>

      {settingsModalOpen && userId && (
        <SettingsModal userId={userId} onClose={() => setSettingsModalOpen(false)} />
      )}
    </div>
  )
}
