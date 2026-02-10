'use client'

import { useId } from 'react'

/**
 * FlexiWork brand logo: blue/purple gradient location pin (teardrop) with inner circle.
 * Matches main app header / navigation. Colors: #3B82F6 → #8B5CF6 (gradient-primary).
 */
export default function FlexiWorkLogoIcon({
  className = 'w-11 h-11',
  style,
  size = 44,
}: {
  className?: string
  style?: React.CSSProperties
  size?: number
}) {
  const id = useId().replace(/:/g, '')
  const gradientId = `flexiwork-pin-${id}`
  const s = size
  const viewBox = '0 0 24 30'
  return (
    <svg
      width={s}
      height={s}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {/* Teardrop / location pin shape */}
      <path
        d="M12 2C7.58 2 4 5.58 4 10c0 6 8 14 8 14s8-8 8-14c0-4.42-3.58-8-8-8z"
        fill={`url(#${gradientId})`}
      />
      {/* Inner circle / dot */}
      <circle cx="12" cy="10" r="3.5" fill="white" />
    </svg>
  )
}
