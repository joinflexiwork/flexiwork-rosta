'use client'

import { useEffect, useState } from 'react'
import { Building2, MapPin, CreditCard, Plus, X } from 'lucide-react'
import { getOrganisationIdForCurrentUser, getMyOrganisations, updateOrganisation } from '@/lib/services/organisations'
import { getVenuesByOrg, createVenue } from '@/lib/services/venues'
import type { Venue } from '@/lib/types'
import type { Organisation } from '@/lib/types'

export default function SettingsPage() {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [org, setOrg] = useState<Organisation | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddVenue, setShowAddVenue] = useState(false)
  const [venueForm, setVenueForm] = useState({ name: '', address: '' })
  const [savingVenue, setSavingVenue] = useState(false)
  const [saveOrgLoading, setSaveOrgLoading] = useState(false)
  const [orgForm, setOrgForm] = useState({ name: '', business_reg_number: '', industry: '', billing_email: '' })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const id = await getOrganisationIdForCurrentUser()
      if (!id) return
      setOrgId(id)
      const [orgsRes, venuesRes] = await Promise.all([
        getMyOrganisations(),
        getVenuesByOrg(id),
      ])
      const orgData = orgsRes[0] ?? null
      setOrg(orgData ?? null)
      if (orgData) {
        setOrgForm({
          name: orgData.name ?? '',
          business_reg_number: orgData.business_reg_number ?? '',
          industry: orgData.industry ?? '',
          billing_email: orgData.billing_email ?? '',
        })
      }
      setVenues(venuesRes ?? [])
    } catch (e) {
      console.error('Settings load error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !org) return
    setSaveOrgLoading(true)
    try {
      await updateOrganisation(orgId, orgForm)
      alert('Organisation updated.')
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaveOrgLoading(false)
    }
  }

  async function handleAddVenue(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !venueForm.name.trim()) {
      alert('Please enter a venue name.')
      return
    }
    setSavingVenue(true)
    try {
      await createVenue({
        organisation_id: orgId,
        name: venueForm.name.trim(),
        address: venueForm.address.trim() || undefined,
      })
      setVenueForm({ name: '', address: '' })
      setShowAddVenue(false)
      loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add venue')
    } finally {
      setSavingVenue(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-600">Loading settings...</div>
      </div>
    )
  }

  if (!orgId || !org) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-600">No organisation found. Complete setup first.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-1">Settings</h1>
          <p className="text-gray-600">Manage your organisation and venues</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        {/* Organisation Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Organisation</h2>
              <p className="text-sm text-gray-600">{org.name}</p>
            </div>
          </div>

          <form onSubmit={handleSaveOrg} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Organisation Name</label>
              <input
                type="text"
                value={orgForm.name}
                onChange={(e) => setOrgForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Business Registration</label>
              <input
                type="text"
                value={orgForm.business_reg_number}
                onChange={(e) => setOrgForm((p) => ({ ...p, business_reg_number: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Industry</label>
              <select
                value={orgForm.industry}
                onChange={(e) => setOrgForm((p) => ({ ...p, industry: e.target.value }))}
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
                value={orgForm.billing_email}
                onChange={(e) => setOrgForm((p) => ({ ...p, billing_email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="mt-6 pt-6 border-t border-gray-200 md:col-span-2">
              <button
                type="submit"
                disabled={saveOrgLoading}
                className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg transition-all font-medium disabled:opacity-50"
              >
                {saveOrgLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Venues */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <MapPin className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Venues</h2>
                <p className="text-sm text-gray-600">{venues.length} location{venues.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAddVenue(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Venue
            </button>
          </div>

          {showAddVenue && (
            <form onSubmit={handleAddVenue} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">New venue</span>
                <button type="button" onClick={() => setShowAddVenue(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Venue name *"
                  value={venueForm.name}
                  onChange={(e) => setVenueForm((p) => ({ ...p, name: e.target.value }))}
                  className="border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Address"
                  value={venueForm.address}
                  onChange={(e) => setVenueForm((p) => ({ ...p, address: e.target.value }))}
                  className="border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={savingVenue}
                className="mt-3 px-4 py-2 bg-gradient-primary text-white rounded-lg font-medium disabled:opacity-50"
              >
                {savingVenue ? 'Adding...' : 'Add Venue'}
              </button>
            </form>
          )}

          <div className="space-y-3">
            {venues.length === 0 && !showAddVenue && (
              <p className="text-gray-500 text-sm">No venues yet. Click &quot;Add Venue&quot; to create one.</p>
            )}
            {venues.map((venue) => (
              <div key={venue.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div>
                  <h3 className="font-semibold text-gray-900">{venue.name}</h3>
                  <p className="text-sm text-gray-600">{venue.address || 'No address'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => alert(`Venue: ${venue.name}\nAddress: ${venue.address || 'No address'}\n\nFull venue editing coming in Phase 2.`)}
                  className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  Manage
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Subscription</h2>
              <p className="text-sm text-gray-600">Pro Plan - Up to 200 employees</p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-3xl font-bold text-gray-900 mb-1">S$149<span className="text-lg font-normal text-gray-600">/month</span></div>
                <p className="text-sm text-gray-600">Billed monthly • Next payment: 27 Feb 2026</p>
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                Active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <div className="text-sm text-gray-600 mb-1">Current Usage</div>
                <div className="text-xl font-bold text-gray-900">189 / 200</div>
                <div className="text-xs text-gray-500">employees</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Venues</div>
                <div className="text-xl font-bold text-gray-900">3 / 10</div>
                <div className="text-xs text-gray-500">locations</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => alert('Change Plan — Coming in Phase 2.')}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium border border-gray-300"
              >
                Change Plan
              </button>
              <button
                type="button"
                onClick={() => alert('Payment Method — Coming in Phase 2.')}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium border border-gray-300"
              >
                Payment Method
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
