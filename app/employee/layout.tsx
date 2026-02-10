'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Clock, User } from 'lucide-react'
import EmployeePageHeader from '@/components/employee/EmployeePageHeader'

function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/employee/dashboard' && pathname?.startsWith(href))
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-1 transition-colors ${
        isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      <span
        className={`flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
          isActive ? 'bg-indigo-100 text-indigo-600' : ''
        }`}
      >
        <Icon className="w-6 h-6" />
      </span>
      <span className="text-xs font-medium">{label}</span>
    </Link>
  )
}

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20">
      <EmployeePageHeader />
      <main className="pt-24 px-4">
        {children}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40 shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-around items-center h-20 px-2">
          <NavLink href="/employee/dashboard" icon={Home} label="Home" />
          <NavLink href="/employee/schedule" icon={Calendar} label="Schedule" />
          <NavLink href="/employee/hours" icon={Clock} label="Hours" />
          <NavLink href="/employee/profile" icon={User} label="Profile" />
        </div>
      </nav>
    </div>
  )
}
