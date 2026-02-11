'use client'

import { useState } from 'react'
import { X, Star, Mail, User } from 'lucide-react'
import { ContactWorkerModal } from '@/app/dashboard/components/contact-worker-modal'

export type WorkerProfileData = {
  id: string
  /** Worker's auth user id (profiles.id) – for notifications / contact */
  user_id?: string | null
  profile?: { full_name?: string; email?: string } | null
  employment_type?: string
  roles?: { role?: { name?: string } }[]
}

export default function WorkerProfileModal({
  worker,
  onClose,
  senderId = '',
  senderName = '',
}: {
  worker: WorkerProfileData | null
  onClose: () => void
  senderId?: string
  senderName?: string
}) {
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)

  if (!worker) return null

  const profile = worker.profile
  const fullName = profile?.full_name ?? 'Worker'
  const email = profile?.email ?? ''
  const roleName = worker.roles?.[0]?.role?.name ?? 'Team member'
  const employmentType = worker.employment_type === 'full_time' ? 'Full time' : worker.employment_type === 'part_time' ? 'Part time' : '—'
  const rating = 4.5
  const ratingCount = 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
          <h2 className="text-lg font-bold text-gray-900">Worker profile</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
              {fullName.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{fullName}</h3>
              <p className="text-sm text-gray-500">{roleName}</p>
              <div className="flex items-center gap-1 mt-1 text-amber-600">
                <Star className="w-4 h-4 fill-amber-400" />
                <span className="text-sm font-medium">{rating}</span>
                {ratingCount > 0 && <span className="text-xs text-gray-500">({ratingCount} reviews)</span>}
              </div>
            </div>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-500">Employment:</span>
              <span className="text-gray-900">{employmentType}</span>
            </div>
            {email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-gray-500">Email:</span>
                <a href={`mailto:${email}`} className="text-purple-600 hover:underline truncate">
                  {email}
                </a>
              </div>
            )}
          </dl>

          {ratingCount > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent reviews</h4>
              <p className="text-sm text-gray-500">No reviews yet.</p>
            </div>
          )}
          {ratingCount === 0 && (
            <p className="text-sm text-gray-500">Rating shown when reviews are available.</p>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 flex gap-3">
          {email && (
            <button
              type="button"
              onClick={() => setIsContactModalOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90"
            >
              <Mail className="w-4 h-4" />
              Contact worker
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 border border-gray-200 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>

      <ContactWorkerModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        workerUserId={worker.user_id ?? null}
        workerName={fullName}
        workerEmail={email}
        senderId={senderId}
        senderName={senderName}
      />
    </div>
  )
}
