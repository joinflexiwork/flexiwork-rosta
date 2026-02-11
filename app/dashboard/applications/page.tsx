'use client'

import { useEffect, useState } from 'react'
import { FileText, Mail, Calendar, User } from 'lucide-react'
import { getOrganisationIdForCurrentUser } from '@/lib/services/organisations'
import { getApplicationsForOrg, type ApplicationRow } from '@/lib/services/applications'

export default function ApplicationsPage() {
  const [list, setList] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const orgId = await getOrganisationIdForCurrentUser()
        if (!orgId) return
        const data = await getApplicationsForOrg(orgId)
        setList(data)
      } catch (e) {
        console.error('[Applications] load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Applications</h1>
      <p className="text-gray-600 mb-6">Jelentkezések és meghívók az organisationhez.</p>

      {list.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No applications yet</p>
          <p className="text-gray-400 text-sm mt-1">Invite team members from the Team page to see applications here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((row) => (
            <li
              key={row.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Mail className="w-5 h-5 text-gray-400 shrink-0" />
                <span className="font-medium text-gray-900 truncate">{row.email}</span>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {row.hierarchy_level}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  row.status === 'pending'
                    ? 'bg-amber-100 text-amber-800'
                    : row.status === 'accepted'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-700'
                }`}
              >
                {row.status}
              </span>
              {row.inviter_name && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <User className="w-4 h-4" />
                  {row.inviter_name}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-gray-400 ml-auto">
                <Calendar className="w-4 h-4" />
                {new Date(row.created_at).toLocaleDateString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
