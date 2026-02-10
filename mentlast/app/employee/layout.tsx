import Link from 'next/link'
import { Home, Calendar, Clock, User } from 'lucide-react'

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {children}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="max-w-4xl mx-auto flex justify-around items-center h-16">
          <Link
            href="/employee/dashboard"
            className="flex flex-col items-center gap-1 text-blue-600"
          >
            <Home className="w-6 h-6" />
            <span className="text-xs font-medium">Home</span>
          </Link>
          <Link
            href="/employee/schedule"
            className="flex flex-col items-center gap-1 text-gray-500 hover:text-gray-700"
          >
            <Calendar className="w-6 h-6" />
            <span className="text-xs font-medium">Schedule</span>
          </Link>
          <Link
            href="/employee/hours"
            className="flex flex-col items-center gap-1 text-gray-500 hover:text-gray-700"
          >
            <Clock className="w-6 h-6" />
            <span className="text-xs font-medium">Hours</span>
          </Link>
          <Link
            href="/employee/profile"
            className="flex flex-col items-center gap-1 text-gray-500 hover:text-gray-700"
          >
            <User className="w-6 h-6" />
            <span className="text-xs font-medium">Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
