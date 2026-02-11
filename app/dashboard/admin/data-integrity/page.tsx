'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, UserX, Users, UserCheck } from 'lucide-react'
import { getDataIntegrity } from '@/app/actions/admin-actions'
import type { IntegrityResult } from '@/app/actions/admin-actions'

export default function DataIntegrityPage() {
  const [data, setData] = useState<IntegrityResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDataIntegrity().then((r) => {
      setData(r)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (data?.error) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-amber-600 shrink-0" />
          <div>
            <h2 className="font-bold text-amber-900">Access denied</h2>
            <p className="text-amber-800 text-sm">{data.error}</p>
          </div>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-2 mt-6 text-blue-600 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    )
  }

  const hasIssues =
    (data?.orphanedProfiles?.length ?? 0) > 0 ||
    (data?.ghostAuthUsers?.length ?? 0) > 0

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Data Integrity Check</h1>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>

      {hasIssues && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
          <p className="text-amber-800 text-sm">
            Fix orphaned profiles with <code className="bg-amber-100 px-1 rounded">FIX_AUTH_USER_GEZA.sql</code> in Supabase SQL Editor.
          </p>
        </div>
      )}

      {/* Orphaned profiles: have profile but no auth user */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <h2 className="px-6 py-4 bg-gray-50 font-semibold text-gray-900 flex items-center gap-2">
          <UserX className="w-5 h-5 text-red-500" />
          Orphaned profiles (no auth user)
        </h2>
        <p className="px-6 py-2 text-sm text-gray-500">
          Profiles exist but no auth.users entry – user cannot login.
        </p>
        <div className="px-6 pb-6">
          {data?.orphanedProfiles?.length ? (
            <ul className="space-y-2">
              {data.orphanedProfiles.map((p) => (
                <li key={p.id} className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
                  <span className="font-mono text-xs text-gray-500">{p.id.slice(0, 8)}...</span>
                  <span className="font-medium">{p.full_name ?? '—'}</span>
                  <span className="text-gray-600">{p.email ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-green-600 text-sm py-2">None – all profiles have auth users.</p>
          )}
        </div>
      </div>

      {/* Pending team members: no user_id yet */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <h2 className="px-6 py-4 bg-gray-50 font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-500" />
          Pending invites (no user_id)
        </h2>
        <p className="px-6 py-2 text-sm text-gray-500">
          Team members with pending invite – waiting for user to accept.
        </p>
        <div className="px-6 pb-6">
          {data?.pendingTeamMembers?.length ? (
            <ul className="space-y-2">
              {data.pendingTeamMembers.map((p) => (
                <li key={p.id} className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
                  <span className="font-mono text-xs text-gray-500">{p.invite_code ?? '—'}</span>
                  <span className="font-medium">{p.full_name ?? '—'}</span>
                  <span className="text-gray-600">{p.email ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-green-600 text-sm py-2">None – no pending invites.</p>
          )}
        </div>
      </div>

      {/* Ghost auth users: auth user but no profile */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <h2 className="px-6 py-4 bg-gray-50 font-semibold text-gray-900 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-blue-500" />
          Ghost auth users (no profile)
        </h2>
        <p className="px-6 py-2 text-sm text-gray-500">
          Auth users without profiles – may cause issues in app.
        </p>
        <div className="px-6 pb-6">
          {data?.ghostAuthUsers?.length ? (
            <ul className="space-y-2">
              {data.ghostAuthUsers.map((u) => (
                <li key={u.id} className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
                  <span className="font-mono text-xs text-gray-500">{u.id.slice(0, 8)}...</span>
                  <span className="text-gray-600">{u.email ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-green-600 text-sm py-2">None – all auth users have profiles.</p>
          )}
        </div>
      </div>
    </div>
  )
}
