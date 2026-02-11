'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { acceptHierarchicalInvite } from '@/lib/services/invites'
import { CheckCircle } from 'lucide-react'

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [validating, setValidating] = useState(!!token)
  const [valid, setValid] = useState<boolean | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    if (!token) {
      setValidating(false)
      setValid(false)
      setAuthChecked(true)
      return
    }
    let cancelled = false
    fetch(`/api/invite/validate-token?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setValid(!!data.valid)
        setReason((data as { reason?: string }).reason ?? null)
      })
      .catch(() => {
        if (!cancelled) setValid(false)
      })
      .finally(() => {
        if (!cancelled) setValidating(false)
      })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) {
        setAuthChecked(true)
        setIsLoggedIn(!!user)
      }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!authChecked || !valid || !token) return
    if (isLoggedIn) return
    const redirect = `/invite/accept?token=${encodeURIComponent(token)}`
    router.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`)
  }, [authChecked, valid, token, isLoggedIn, router])

  async function handleAccept() {
    if (!token) return
    setLoading(true)
    try {
      const result = await acceptHierarchicalInvite(token)
      setAccepted(true)
      const level = result.hierarchy_level
      const isManager = ['employer', 'gm', 'agm', 'shift_leader'].includes(level)
      setTimeout(() => {
        router.push(isManager ? '/dashboard' : '/employee/dashboard')
        router.refresh()
      }, 2000)
    } catch (err) {
      console.error('Accept invite error:', err)
      alert(err instanceof Error ? err.message : 'Failed to accept invite')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-600">Invalid Invite Link</h1>
          <p className="text-gray-600">Missing token. Please use the link from your invite email.</p>
        </div>
      </div>
    )
  }

  if (validating || !authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <div className="text-gray-600 font-medium">Validating invite…</div>
        </div>
      </div>
    )
  }

  if (valid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-600">Invalid or expired invite</h1>
          <p className="text-gray-600">
            {reason === 'already_used'
              ? 'This invite has already been used.'
              : reason === 'expired'
                ? 'This invite has expired.'
                : 'This link may have expired or already been used. Please request a new invite.'}
          </p>
        </div>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to the team!</h1>
          <p className="text-gray-600 mb-4">You have accepted the invite successfully.</p>
          <p className="text-sm text-gray-500">Redirecting to your dashboard…</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <div className="text-gray-600 font-medium">Redirecting to login…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">Accept invitation</h1>
          <p className="text-gray-600">You have been invited to join the organisation. Accept to continue.</p>
        </div>
        <button
          type="button"
          onClick={handleAccept}
          disabled={loading}
          className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Accepting…' : 'Accept invitation'}
        </button>
      </div>
    </div>
  )
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-gray-600">Loading...</div>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  )
}
