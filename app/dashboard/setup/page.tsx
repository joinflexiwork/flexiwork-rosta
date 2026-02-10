'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, MapPin, Users as UsersIcon, Check } from 'lucide-react'
import { createOrganisation } from '@/lib/services/organisations'
import { createVenue } from '@/lib/services/venues'
import { createRole } from '@/lib/services/roles'

export default function SetupWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  const [orgData, setOrgData] = useState({
    name: '',
    industry: 'food_beverage',
    billing_email: '',
  })

  const [venueData, setVenueData] = useState({
    name: '',
    address: '',
  })

  const [roleNames, setRoleNames] = useState(['Barista', 'Server', 'Chef', 'Kitchen Porter'])

  async function handleComplete() {
    setLoading(true)
    try {
      const org = await createOrganisation({
        name: orgData.name,
        industry: orgData.industry,
        billing_email: orgData.billing_email || undefined,
      })
      if (!org?.id) {
        throw new Error('Organisation was not created (no id returned)')
      }

      const venue = await createVenue({
        organisation_id: org.id,
        name: venueData.name,
        address: venueData.address || undefined,
      })
      if (!venue?.id) {
        throw new Error('Venue was not created (no id returned)')
      }

      const toCreate = roleNames.filter((r) => r.trim())
      const roleColors = ['#8B5CF6', '#3B82F6', '#EF4444', '#10B981']
      await Promise.all(
        toCreate.map((name, idx) =>
          createRole({
            organisation_id: org.id,
            name: name.trim(),
            colour: roleColors[idx % roleColors.length],
          })
        )
      )
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Setup] Setup failed:', err)
      alert(`Setup failed: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-8">
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  step >= s ? 'bg-gradient-primary text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step > s ? <Check className="w-6 h-6" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`w-24 h-1 mx-1 ${step > s ? 'bg-gradient-primary' : 'bg-gray-200'}`}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Create Organisation</h2>
                <p className="text-gray-600">Tell us about your business</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Organisation Name *</label>
                <input
                  type="text"
                  value={orgData.name}
                  onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                  placeholder="e.g., Marina Bay Café & Restaurant Group"
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Industry *</label>
                <select
                  value={orgData.industry}
                  onChange={(e) => setOrgData({ ...orgData, industry: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="food_beverage">Food & Beverage</option>
                  <option value="hospitality">Hospitality</option>
                  <option value="retail">Retail</option>
                  <option value="events">Events</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Billing Email</label>
                <input
                  type="email"
                  value={orgData.billing_email}
                  onChange={(e) => setOrgData({ ...orgData, billing_email: e.target.value })}
                  placeholder="billing@yourcompany.com"
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!orgData.name.trim()}
              className="w-full mt-6 px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <MapPin className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Add First Venue</h2>
                <p className="text-gray-600">You can add more later</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Venue Name *</label>
                <input
                  type="text"
                  value={venueData.name}
                  onChange={(e) => setVenueData({ ...venueData, name: e.target.value })}
                  placeholder="e.g., Marina Bay Outlet"
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                <input
                  type="text"
                  value={venueData.address}
                  onChange={(e) => setVenueData({ ...venueData, address: e.target.value })}
                  placeholder="10 Marina Boulevard, Singapore"
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-all"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!venueData.name.trim()}
                className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <UsersIcon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Set Up Roles</h2>
                <p className="text-gray-600">Define job positions</p>
              </div>
            </div>
            <div className="space-y-3 mb-6">
              {roleNames.map((role, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => {
                      const newRoles = [...roleNames]
                      newRoles[idx] = e.target.value
                      setRoleNames(newRoles)
                    }}
                    className="flex-1 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setRoleNames(roleNames.filter((_, i) => i !== idx))}
                    className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRoleNames([...roleNames, ''])}
              className="w-full mb-6 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              + Add Role
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-all"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={loading || roleNames.filter((r) => r.trim()).length === 0}
                className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
