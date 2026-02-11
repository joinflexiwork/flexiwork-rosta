import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamPage from '../page'
import * as teamService from '@/lib/services/team'

vi.mock('@/lib/services/team', () => ({
  getTeamMembers: vi.fn(),
  deleteTeamMember: vi.fn(),
  getTeamMemberWithRoles: vi.fn(),
  updateTeamMemberProfile: vi.fn(),
}))
vi.mock('@/lib/services/roles', () => ({ getRolesByOrg: vi.fn(() => Promise.resolve([])) }))
vi.mock('@/lib/services/venues', () => ({ getVenuesByOrg: vi.fn(() => Promise.resolve([])) }))
vi.mock('@/lib/services/settings', () => ({ getOrganisationSettings: vi.fn(() => Promise.resolve({ show_ratings: true })) }))
vi.mock('@/lib/services/organisations', () => ({
  getOrganisationIdForCurrentUser: vi.fn(() => Promise.resolve('org-1')),
}))
vi.mock('@/app/actions/hierarchy', () => ({
  getTeamHierarchy: vi.fn(() => Promise.resolve({ members: [], chain: [] })),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) } },
}))

describe('Team page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    vi.mocked(teamService.getTeamMembers).mockResolvedValue([])
    render(<TeamPage />)
    await screen.findByText(/Loading team|Manage Team/i, {}, { timeout: 3000 })
  })

  it('shows Loading state initially', async () => {
    vi.mocked(teamService.getTeamMembers).mockImplementation(() => new Promise(() => {}))
    render(<TeamPage />)
    expect(screen.getByText(/Loading team/i)).toBeInTheDocument()
  })

  it('shows member list when data exists', async () => {
    vi.mocked(teamService.getTeamMembers).mockResolvedValue([
      {
        id: 'tm1',
        status: 'active',
        profile: { full_name: 'Alice', email: 'alice@test.com' },
        roles: [],
        primary_venue: null,
        venues: [],
      } as unknown as Record<string, unknown>,
    ])
    render(<TeamPage />)
    await screen.findByText(/Manage Team/i, {}, { timeout: 3000 })
    await screen.findByText(/Alice/i, {}, { timeout: 3000 })
  })

  it('shows empty state when no members', async () => {
    vi.mocked(teamService.getTeamMembers).mockResolvedValue([])
    render(<TeamPage />)
    await screen.findByText(/Manage Team/i, {}, { timeout: 3000 })
    const emptyOrFilters = await screen.findByText(/No members match|Role/i, {}, { timeout: 3000 })
    expect(emptyOrFilters).toBeInTheDocument()
  })
})
