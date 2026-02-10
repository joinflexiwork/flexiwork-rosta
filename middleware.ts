import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware: AUTH ONLY. Do NOT redirect to /dashboard/setup here.
 * Organisation / setup redirects are handled in app/dashboard/layout.tsx and
 * app/dashboard/page.tsx (client-side) so getOrganisationIdForCurrentUser()
 * and hasTeamMembership() can run with the user session.
 */
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
