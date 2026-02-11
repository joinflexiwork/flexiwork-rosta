'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { createTenantWithOwner, completeOnboarding } from '@/app/actions/onboarding-actions'

type Step = 'organisation' | 'invite' | 'processing'

function OnboardingContent() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState<Step>('organisation')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [organisationId, setOrganisationId] = useState<string | null>(null)

  const [orgData, setOrgData] = useState({
    organisationName: '',
    companyAddress: '',
    taxId: '',
  })

  const [inviteData, setInviteData] = useState({
    email: '',
    position: 'gm' as 'employer' | 'gm' | 'agm',
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
      setAuthLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!authLoading && !userId) {
      router.push('/auth/login?redirect=/onboarding')
    }
  }, [authLoading, userId, router])

  useEffect(() => {
    async function checkAccess() {
      if (authLoading || !userId) return
      const { data: tm } = await supabase
        .from('team_members')
        .select('hierarchy_level')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const level = (tm as { hierarchy_level?: string } | null)?.hierarchy_level
      if (level === 'worker') {
        router.replace('/worker/dashboard')
        return
      }
      const { data: org } = await supabase
        .from('organisations')
        .select('id, onboarding_completed')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (org?.onboarding_completed) {
        router.replace('/dashboard')
      }
    }
    checkAccess()
  }, [authLoading, userId, router])

  const handleCreateOrganisation = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    if (!userId) {
      setError('Authentication required')
      setIsSubmitting(false)
      return
    }
    const result = await createTenantWithOwner(userId, orgData)
    if (result.success && result.organisationId) {
      setOrganisationId(result.organisationId)
      setCurrentStep('invite')
    } else {
      setError(result.error ?? 'Failed to create organisation')
    }
    setIsSubmitting(false)
  }

  const handleComplete = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setIsSubmitting(true)
    setError(null)
    if (!userId || !organisationId) return
    const result = await completeOnboarding(
      userId,
      organisationId,
      inviteData.email.trim()
        ? {
            firstInviteEmail: inviteData.email.trim(),
            firstInvitePosition: inviteData.position,
          }
        : undefined
    )
    if (result.success) {
      router.push('/dashboard')
      router.refresh()
    } else {
      setError(result.error ?? 'Failed to complete onboarding')
      setIsSubmitting(false)
    }
  }

  const steps = [
    { id: 'organisation' as const, label: 'Organisation Setup' },
    { id: 'invite' as const, label: 'Invite Team (Optional)' },
  ]

  if (authLoading || !userId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="bg-gray-50 px-8 py-6 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Welcome to FlexiWork Rosta</h1>
              <p className="text-gray-600 mt-1">Let&apos;s set up your organisation</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut()
                router.push('/auth/login')
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </div>
          <div className="flex mt-6 space-x-4">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep === step.id
                      ? 'bg-purple-600 text-white'
                      : steps.findIndex((s) => s.id === currentStep) > idx
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {steps.findIndex((s) => s.id === currentStep) > idx ? '✓' : idx + 1}
                </div>
                <span className="ml-2 text-sm font-medium text-gray-700">{step.label}</span>
                {idx < steps.length - 1 && <div className="ml-4 w-12 h-0.5 bg-gray-200" />}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-8 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
        )}

        {currentStep === 'organisation' && (
          <form onSubmit={handleCreateOrganisation} className="p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organisation Name *</label>
              <input
                type="text"
                required
                value={orgData.organisationName}
                onChange={(e) => setOrgData({ ...orgData, organisationName: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="e.g., Test Cafe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Address</label>
              <textarea
                value={orgData.companyAddress}
                onChange={(e) => setOrgData({ ...orgData, companyAddress: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="Full address"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID / Registration Number</label>
              <input
                type="text"
                value={orgData.taxId}
                onChange={(e) => setOrgData({ ...orgData, taxId: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="Optional"
              />
            </div>
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Organisation'}
              </button>
            </div>
          </form>
        )}

        {currentStep === 'invite' && (
          <div className="p-8 space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <h3 className="font-medium text-blue-900">Optional: Invite your first team member</h3>
              <p className="text-sm text-blue-700 mt-1">
                You can skip this and invite people later from the Team page.
              </p>
            </div>
            <form onSubmit={handleComplete} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={inviteData.email}
                  onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="colleague@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position Level</label>
                <select
                  value={inviteData.position}
                  onChange={(e) => setInviteData({ ...inviteData, position: e.target.value as 'employer' | 'gm' | 'agm' })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="gm">General Manager</option>
                  <option value="agm">Assistant GM</option>
                  <option value="employer">Employer (Manager)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">As Owner, you can invite up to Employer level.</p>
              </div>
              <div className="pt-4 flex space-x-3">
                <button
                  type="button"
                  onClick={() => handleComplete()}
                  disabled={isSubmitting}
                  className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50"
                >
                  Skip for now
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !inviteData.email.trim()}
                  className="flex-1 bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Sending...' : 'Send Invite & Continue'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}
