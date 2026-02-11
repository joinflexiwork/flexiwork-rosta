'use client'

import { Hash, Calendar } from 'lucide-react'

export interface DetailsCardProps {
  employeeId: string
  joinedDate: string
}

export function DetailsCard({ employeeId, joinedDate }: DetailsCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Details</h2>
      <ul className="space-y-3">
        <li className="flex items-center gap-3 text-gray-700">
          <Hash className="w-5 h-5 text-gray-400" />
          Employee ID: {employeeId}
        </li>
        <li className="flex items-center gap-3 text-gray-700">
          <Calendar className="w-5 h-5 text-gray-400" />
          Joined {joinedDate}
        </li>
      </ul>
    </div>
  )
}
