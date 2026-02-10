'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { User, Mail, Phone, MapPin, Briefcase } from 'lucide-react'

type TeamMemberRow = {
  id: string
  member_type: string
  employment_type: string
  status: string
  profile?: { full_name?: string; email?: string }
  primary_venue?: { name?: string }
  roles?: { role: { name: string } }[]
}

export default function WorkerProfilePage() {
  const [profile, setProfile] = useState<{ full_name?: string; email?: string } | null>(null)
  const [memberships, setMemberships] = useState<TeamMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .single()
        setProfile(profileData as { full_name?: string; email?: string } | null)
        setFormName(profileData?.full_name ?? '')

        const { data: members } = await supabase
          .from('team_members')
          .select(`
            id,
            member_type,
            employment_type,
            status,
            primary_venue:venues(name),
            roles:team_member_roles(role:roles(name))
          `)
          .eq('user_id', user.id)
        setMemberships((members as unknown) as TeamMemberRow[] ?? [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSaveProfile() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('profiles').update({ full_name: formName }).eq('id', user.id)
      setProfile((p) => (p ? { ...p, full_name: formName } : null))
      setEditing(false)
    } catch (e) {
      console.error(e)
      alert('Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  const displayName = profile?.full_name || 'Worker'
  const email = profile?.email ?? ''

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gradient-primary text-white p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <User className="w-8 h-8" />
            </div>
            <div>
              {editing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 rounded-lg bg-white/20 border border-white/40 text-white placeholder-white/70"
                    placeholder="Full name"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="px-4 py-2 bg-white text-blue-600 rounded-lg font-medium text-sm disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setFormName(displayName); }}
                      className="px-4 py-2 text-white/90 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold">{displayName}</h2>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="mt-1 text-sm text-blue-100 hover:text-white underline"
                  >
                    Edit profile
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 text-gray-700">
            <Mail className="w-5 h-5 text-gray-400" />
            <span>{email || '-'}</span>
          </div>
          <div className="flex items-center gap-3 text-gray-700">
            <Phone className="w-5 h-5 text-gray-400" />
            <span>-</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-gray-500" />
          Assigned venues & roles
        </h2>
        {memberships.length === 0 ? (
          <p className="text-gray-500 text-sm">No assignments yet.</p>
        ) : (
          <ul className="space-y-4">
            {memberships.map((m) => {
              const venueName = m.primary_venue?.name ?? 'Organisation'
              const roleNames = Array.isArray(m.roles)
                ? m.roles.map((r: { role: { name: string } }) => r.role?.name).filter(Boolean).join(', ')
                : ''
              const employmentLabel = (m.employment_type ?? '').replace('_', ' ') || '-'
              const statusLabel = m.status === 'active' ? 'Active' : m.status === 'inactive' ? 'Inactive' : String(m.status)
              const statusClass = m.status === 'active' ? 'text-green-600' : 'text-amber-600'
              return (
                <li key={m.id} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{venueName}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    Roles: {roleNames || '-'}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Employment: {employmentLabel} • Status: <span className={statusClass}>{statusLabel}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Employment status</p>
        <p>Active = you can be assigned shifts. Inactive = paused (toggle coming later).</p>
      </div>
    </div>
  )
}
