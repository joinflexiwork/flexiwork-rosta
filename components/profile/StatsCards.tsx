'use client'

import { CheckCircle2, Star, Clock, Zap, Lock } from 'lucide-react'

function formatHours(hours: number): string {
  return hours.toLocaleString('en-GB', { maximumFractionDigits: 0, minimumFractionDigits: 0 })
}

function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export interface StatsCardsProps {
  attendanceRatePercent: number
  averageRating: number | null
  averageResponseTimeMinutes: number | null
  hoursWorked: number
  showRatings?: boolean
}

export function StatsCards({
  attendanceRatePercent,
  averageRating,
  averageResponseTimeMinutes,
  hoursWorked,
  showRatings = true,
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        </div>
        <p className="text-2xl font-bold text-gray-900">{attendanceRatePercent}%</p>
        <p className="text-sm text-gray-500">Attendance rate</p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
          {showRatings ? <Star className="w-5 h-5 text-amber-600" /> : <Lock className="w-5 h-5 text-gray-500" />}
        </div>
        {showRatings && averageRating != null ? (
          <>
            <p className="text-2xl font-bold text-gray-900">{averageRating.toFixed(1)}</p>
            <p className="text-sm text-gray-500">Average rating</p>
          </>
        ) : (
          <p className="text-sm text-gray-600">Ratings hidden</p>
        )}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
          <Clock className="w-5 h-5 text-blue-600" />
        </div>
        <p className="text-2xl font-bold text-gray-900">
          {averageResponseTimeMinutes != null ? formatResponseTime(averageResponseTimeMinutes) : 'N/A'}
        </p>
        <p className="text-sm text-gray-500">Avg response time</p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-3">
          <Zap className="w-5 h-5 text-purple-600" />
        </div>
        <p className="text-2xl font-bold text-gray-900">{formatHours(hoursWorked)}</p>
        <p className="text-sm text-gray-500">Hours worked</p>
      </div>
    </div>
  )
}
