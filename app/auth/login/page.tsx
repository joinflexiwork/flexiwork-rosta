'use client'

import { useState, Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

type Tab = 'signin' | 'signup'

function AuthForm() {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') === 'signup' ? 'signup' : 'signin'
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    const t = searchParams.get('tab') === 'signup' ? 'signup' : 'signin'
    setTab(t)
  }, [searchParams])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const redirectTo = searchParams.get('redirect')
  const safeRedirect = redirectTo?.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (signInError) {
        throw new Error(signInError.message)
      }

      if (!authData?.user) {
        setError('Login failed')
        return
      }

      const userId = authData.user.id
      console.log('[Login] User ID:', userId)

      // 1. Check organisations FIRST (owner is source of truth - may not have team_members)
      const { data: org } = await supabase
        .from('organisations')
        .select('id, onboarding_completed')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // 2. Check team_members (worker, manager, or invited)
      const { data: teamMember, error: teamError } = await supabase
        .from('team_members')
        .select('hierarchy_level, organisation_id, status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (teamError) {
        console.error('[Login] team_members query error:', teamError)
      }
      console.log('[Login] Organisation found:', org)
      console.log('[Login] Team member found:', teamMember)

      const level = (teamMember as { hierarchy_level?: string } | null)?.hierarchy_level

      // 3. Redirect logic (never send completed users to onboarding)
      const validPostLoginRedirect = safeRedirect && safeRedirect !== '/onboarding' ? safeRedirect : null

      if (level === 'worker') {
        console.log('[Login] User is WORKER')
        router.push('/worker/dashboard')
      } else if (org) {
        // Owner: has organisation record
        console.log('[Login] User is OWNER')
        if (org.onboarding_completed) {
          router.push(validPostLoginRedirect ?? '/dashboard')
        } else {
          router.push(safeRedirect === '/onboarding' ? '/onboarding' : (validPostLoginRedirect ?? '/onboarding'))
        }
      } else if (teamMember?.organisation_id) {
        // Manager (gm, agm, employer, etc): has team_members with org
        console.log('[Login] User is MANAGER')
        const { data: tmOrg } = await supabase
          .from('organisations')
          .select('onboarding_completed')
          .eq('id', teamMember.organisation_id)
          .maybeSingle()
        if (tmOrg?.onboarding_completed) {
          router.push(validPostLoginRedirect ?? '/dashboard')
        } else {
          router.push(safeRedirect === '/onboarding' ? '/onboarding' : (validPostLoginRedirect ?? '/onboarding'))
        }
      } else {
        // No org, no team_member = new employer
        console.log('[Login] New user - onboarding')
        router.push(safeRedirect ?? '/onboarding')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() || undefined },
        },
      })

      if (signUpError) {
        throw new Error(signUpError.message)
      }

      if (data?.user) {
        if (data.user.identities?.length === 0) {
          setError('This email is already registered. Please log in instead.')
          return
        }
        setSuccess(true)
        router.push('/onboarding')
        router.refresh()
      } else {
        setError('Registration failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo: FlexiWork */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg mb-3 ring-2 ring-white/20">
            <Image
              src="/FWlogo.jpeg"
              alt="FlexiWork"
              width={80}
              height={80}
              className="object-cover w-full h-full"
              priority
            />
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              FlexiWork
            </span>
            <span className="text-2xl font-normal text-gray-700"> Rosta</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => { setTab('signin'); setError(null); setSuccess(false); }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              tab === 'signin'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setTab('signup'); setError(null); setSuccess(false); }}
            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
              tab === 'signup'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg mb-4">
            Account created! Redirecting to onboarding...
          </div>
        )}

        {tab === 'signin' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {isLoading ? 'Logging in...' : 'Log In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                required
                minLength={6}
              />
              <p className="text-xs text-gray-500 mt-1">At least 6 characters</p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {isLoading ? 'Creating account...' : 'Register'}
            </button>
          </form>
        )}

        {tab === 'signin' && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => setTab('signup')}
              className="text-purple-600 hover:underline font-medium"
            >
              Sign Up
            </button>
          </div>
        )}
        {tab === 'signup' && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => setTab('signin')}
              className="text-purple-600 hover:underline font-medium"
            >
              Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <AuthForm />
    </Suspense>
  )
}
