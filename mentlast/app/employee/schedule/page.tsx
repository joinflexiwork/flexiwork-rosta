'use client'

import Link from 'next/link'

export default function EmployeeSchedulePage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Schedule</h1>
      <p className="text-gray-600 mb-6">View your shifts by week. (Coming soon)</p>
      <Link
        href="/employee/dashboard"
        className="inline-block px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
