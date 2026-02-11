'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

interface ContactWorkerModalProps {
  isOpen: boolean
  onClose: () => void
  /** Worker's user id (profiles.id) – used for notifications; if missing, only mailto is used */
  workerUserId: string | null
  workerName: string
  workerEmail: string
  senderId: string
  senderName: string
}

export function ContactWorkerModal({
  isOpen,
  onClose,
  workerUserId,
  workerName,
  workerEmail,
  senderId,
  senderName,
}: ContactWorkerModalProps) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleSend = async () => {
    if (!message.trim()) {
      setToast({ type: 'error', message: 'Please enter a message' })
      return
    }

    setLoading(true)
    setToast(null)

    try {
      if (workerUserId) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: workerUserId,
            type: 'direct_message',
            title: `New message from ${senderName}`,
            message: message.trim(),
            data: {
              sender_id: senderId,
              sender_name: senderName,
              worker_email: workerEmail,
            },
          })

        if (notifError) throw notifError
        setToast({ type: 'success', message: 'Message sent successfully' })
        setMessage('')
        setTimeout(() => onClose(), 800)
      } else {
        handleMailto()
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setToast({ type: 'error', message: 'Failed to send message. Try the email option below.' })
    } finally {
      setLoading(false)
    }
  }

  const handleMailto = () => {
    const subject = encodeURIComponent(`Message from ${senderName}`)
    const body = encodeURIComponent(message || '')
    window.location.href = `mailto:${workerEmail}?subject=${subject}&body=${body}`
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
          <h2 className="text-lg font-bold text-gray-900">Send message to {workerName}</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
            <p>To: <strong>{workerName}</strong></p>
            {workerEmail && <p className="text-xs mt-1">{workerEmail}</p>}
          </div>

          <textarea
            placeholder="Type your message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />

          {toast && (
            <p className={`text-sm ${toast.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {toast.message}
            </p>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-200 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !message.trim()}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Message'}
            </button>
          </div>

          {workerEmail && (
            <p className="text-xs text-center text-gray-400 mt-2">
              Or{' '}
              <button type="button" onClick={handleMailto} className="text-purple-600 hover:underline">
                open in your email client
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
