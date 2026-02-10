'use client'

import { useRouter } from 'next/navigation'

type Props = { fallbackHref?: string }

export default function BackButton({ fallbackHref }: Props) {
  const router = useRouter()

  function handleClick() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else if (fallbackHref) {
      router.push(fallbackHref)
    } else {
      router.push('/')
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="fixed left-4 top-4 z-[9999] flex items-center bg-transparent border-none cursor-pointer p-0"
    >
      <div className="flex items-center relative">
        {/* Logo area - matches header so it blends */}
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center shrink-0" />
        {/* Text: "B" overlaps circle, "ack" in normal flow */}
        <div className="relative flex items-center ml-1">
          <span className="text-purple-300 font-bold text-lg relative z-10 -ml-6">
            B
          </span>
          <span className="text-white font-bold text-lg">
            ack
          </span>
        </div>
      </div>
    </button>
  )
}
