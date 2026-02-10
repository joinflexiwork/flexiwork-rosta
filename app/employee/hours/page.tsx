'use client'

import Link from 'next/link'

export default function EmployeeHoursPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Hours</h1>
      <p className="text-gray-600 mb-6">View your approved hours and timesheets.</p>
      <div className="flex flex-wrap gap-4">
        <Link
          href="/employee/timesheets"
          className="inline-block px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg"
        >
          My timesheets
        </Link>
        <Link
          href="/employee/dashboard"
          className="inline-block px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
