'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  /** Controlled: when provided, open state is controlled by parent */
  open?: boolean
  /** Called when open state should change (for controlled mode) */
  onOpenChange?: (open: boolean) => void
  actionButton?: React.ReactNode
  /** Optional: use compact header (e.g. p-4) to match existing layout */
  compactHeader?: boolean
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  actionButton,
  compactHeader,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setIsOpen = (value: boolean) => {
    if (isControlled) {
      onOpenChange?.(value)
    } else {
      setInternalOpen(value)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div
        className={`flex items-center justify-between cursor-pointer hover:bg-gray-50/80 transition-colors ${
          compactHeader ? 'p-4 border-b border-gray-200' : 'p-6'
        } ${!isOpen ? 'border-b-0' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
            className="p-1 rounded-lg hover:bg-gray-200 transition-colors shrink-0"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </button>
        </div>
        {actionButton && (
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {actionButton}
          </div>
        )}
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={compactHeader ? 'px-4 pb-4' : 'p-6 pt-0'}>{children}</div>
        </div>
      </div>
    </div>
  )
}
