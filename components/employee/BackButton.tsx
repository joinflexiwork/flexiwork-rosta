'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function BackButton() {
  const router = useRouter()

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/employee/dashboard')
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="flex flex-col items-center gap-0.5 bg-transparent border-0 cursor-pointer p-2 -ml-1 text-indigo-600 hover:text-indigo-700 active:opacity-80 transition-colors"
      aria-label="Go back"
    >
      <span className="block" style={{ transform: 'rotate(180deg)' }}>
        <Image
          src="/FWlogo.jpeg"
          alt=""
          width={28}
          height={28}
          className="object-contain"
        />
      </span>
      <span className="text-xs font-medium">Back</span>
    </button>
  )
}
