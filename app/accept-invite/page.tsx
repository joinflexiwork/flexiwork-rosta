'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CheckCircle } from 'lucide-react'

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteCode = searchParams.get('code')

  const [validating, setValidating] = useState(!!inviteCode)
  const [valid, setValid] = useState<boolean | null>(null)
  const [step, setStep] = useState<'signup' | 'success'>('signup')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    employment_type: 'part-time' as string,
  })
  const [inviteType, setInviteType] = useState<'team' | 'gig'>('team')

  useEffect(() => {
    if (!inviteCode) {
      setValidating(false)
      setValid(false)
      return
    }
    let cancelled = false
    fetch(`/api/invite/validate?code=${encodeURIComponent(inviteCode)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setValid(!!data.valid)
        if (data.email) {
          setFormData((prev) => ({ ...prev, email: data.email ?? '' }))
        }
        if (data.inviteType === 'gig') setInviteType('gig')
      })
      .catch(() => {
        if (!cancelled) setValid(false)
      })
      .finally(() => {
        if (!cancelled) setValidating(false)
      })
    return () => { cancelled = true }
  }, [inviteCode])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCode) {
      alert('Invalid invite link')
      return
    }
    setLoading(true)
    try {
      let userId: string

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      })

      const isAlreadyRegistered =
        signUpError?.message?.toLowerCase().includes('already registered') ||
        signUpError?.message?.toLowerCase().includes('already been registered') ||
        signUpError?.code === 'user_already_registered'

      if (isAlreadyRegistered) {
        // User exists from a previous attempt; sign in and then link profile/team_member
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        })
        if (signInError) {
          throw new Error('Account already exists with different password. Use the password you set when you first tried to accept this invite.')
        }
        if (!signInData.user) throw new Error('Failed to sign in')
        userId = signInData.user.id
      } else if (signUpError) {
        throw signUpError
      } else if (!signUpData?.user) {
        throw new Error('Failed to create account')
      } else {
        userId = signUpData.user.id
      }

      // Use API with service role to ensure profile exists and link team_members.
      const acceptRes = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode,
          userId,
          fullName: formData.full_name || undefined,
          email: formData.email || undefined,
          employmentType: inviteType === 'gig' ? formData.employment_type : undefined,
        }),
      })
      const acceptData = await acceptRes.json().catch(() => ({}))
      if (!acceptRes.ok) {
        throw new Error((acceptData.error as string) || 'Failed to accept invite')
      }

      const teamMember = acceptData.teamMember as { member_type?: string }
      setStep('success')
      const isManager = teamMember?.member_type === 'manager'
      setTimeout(() => {
        router.push(isManager ? '/dashboard' : '/employee/dashboard')
        router.refresh()
      }, 2000)
    } catch (err: unknown) {
      console.error('Error accepting invite:', err)
      alert(err instanceof Error ? err.message : 'Failed to accept invite')
    } finally {
      setLoading(false)
    }
  }

  if (!inviteCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-600">Invalid Invite Link</h1>
          <p className="text-gray-600">Please check your invite email and try again.</p>
        </div>
      </div>
    )
  }

  if (validating) {
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
          <p className="text-gray-600">This link may have expired or already been used. Please request a new invite.</p>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to FlexiWork!</h1>
          <p className="text-gray-600 mb-4">Your account has been created successfully.</p>
          <p className="text-sm text-gray-500">Redirecting to your dashboard…</p>
        </div>
      </div>
    )
  }

  const webForm = (
    <form onSubmit={handleSignup} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
        <input
          type="text"
          required
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
          placeholder="John Doe"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
        <input
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
          placeholder="john@example.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Password *</label>
        <input
          type="password"
          required
          minLength={6}
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
          placeholder="Minimum 6 characters"
        />
      </div>
      {inviteType === 'gig' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Employment type</label>
          <select
            value={formData.employment_type}
            onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
          >
            <option value="part-time">Part-time</option>
            <option value="full-time">Full-time</option>
            <option value="gig">Gig</option>
          </select>
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50"
      >
        {loading ? 'Creating Account...' : 'Create Account & Join'}
      </button>
      <p className="text-xs text-gray-500 text-center mt-6">
        By creating an account, you agree to our Terms of Service and Privacy Policy
      </p>
    </form>
  )

  if (false) {
    const deepLink = `flexiwork://invite?code=${inviteCode}&type=team`
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
              FlexiWork
            </div>
            <h1 className="text-2xl font-bold mb-2">Accept Your Invite</h1>
            <p className="text-lg text-gray-600 mb-4">Opening FlexiWork app…</p>
            <p className="text-sm text-gray-500">If the app doesn’t open automatically:</p>
          </div>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2 mb-6">
            <li>Open the FlexiWork (Expo Go) app</li>
            <li>Tap &quot;Have an invite code?&quot; and enter:</li>
          </ol>
          <p className="font-mono text-center text-lg font-bold bg-gray-100 rounded-lg py-3 px-4 mb-6 break-all">
            {inviteCode}
          </p>
          <button
            type="button"
            onClick={() => { window.location.href = deepLink }}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium mb-4"
          >
            Open in App
          </button>
          <button
            type="button"
            onClick={() => {}}
            className="w-full text-sm text-gray-600 underline"
          >
            Or sign up on web instead
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-xl p-8 shadow-lg max-w-md w-full">
        <div className="text-center mb-8">
          <div className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
            FlexiWork
          </div>
          <h1 className="text-2xl font-bold mb-2">Accept Your Invite</h1>
          <p className="text-gray-600">Create your account to join the team</p>
        </div>
        {webForm}
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  )
}
