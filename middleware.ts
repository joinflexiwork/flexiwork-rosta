import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Protected path prefixes: require session. Role-based redirect (worker vs employer) stays in layout. */
const DASHBOARD_PREFIX = '/dashboard'
const EMPLOYEE_PREFIX = '/employee'
const WORKER_PREFIX = '/worker'
const API_PROTECTED_PREFIX = '/api/protected'
const LOGIN_PATH = '/auth/login'
const REGISTER_PATH = '/auth/register'
const ONBOARDING_PATH = '/onboarding'

/** Auth-only routes: login/register - always accessible, middleware redirects logged-in users */
function isAuthPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname === REGISTER_PATH || pathname === '/login' || pathname === '/register'
}

/** Public: invite, accept-invite - anyone can access */
function isPublicPath(pathname: string): boolean {
  return pathname.startsWith('/invite') || pathname === '/accept-invite'
}

function isProtectedPath(pathname: string): boolean {
  return (
    pathname.startsWith(DASHBOARD_PREFIX) ||
    pathname.startsWith(EMPLOYEE_PREFIX) ||
    pathname.startsWith(WORKER_PREFIX) ||
    pathname.startsWith(API_PROTECTED_PREFIX)
  )
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  if (!supabaseUrl || !supabaseAnonKey) {
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const pathname = request.nextUrl.pathname
  const user = session?.user

  // ========== ROOT: ALWAYS redirect to login (no auth checks, no role-based redirect) ==========
  if (pathname === '/') {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url))
  }

  // ========== NOT LOGGED IN ==========
  if (!user) {
    if (pathname === ONBOARDING_PATH) {
      const loginUrl = new URL(LOGIN_PATH, request.url)
      loginUrl.searchParams.set('redirect', ONBOARDING_PATH)
      return NextResponse.redirect(loginUrl)
    }
    if (isProtectedPath(pathname)) {
      const loginUrl = new URL(LOGIN_PATH, request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (isAuthPath(pathname) || isPublicPath(pathname) || pathname === '/') {
      return response
    }
    return response
  }

  // ========== LOGGED IN ==========
  // Check organisations FIRST (owner is source of truth; some users may not have team_members)
  const { data: org } = await supabase
    .from('organisations')
    .select('id, onboarding_completed')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // team_members: no strict status filter (include active, pending, etc.)
  const { data: memberships } = await supabase
    .from('team_members')
    .select('hierarchy_level')
    .eq('user_id', user.id)

  const isOwner = org != null
  const isTeamMember = (memberships?.length ?? 0) > 0
  const hasWorkerOnly = isTeamMember && (memberships ?? []).every((m) => m.hierarchy_level === 'worker')

  if (isAuthPath(pathname)) {
    if (isOwner && org?.onboarding_completed) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    if (isOwner && !org?.onboarding_completed) {
      return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url))
    }
    if (isTeamMember) {
      if (hasWorkerOnly) {
        return NextResponse.redirect(new URL('/worker/dashboard', request.url))
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url))
  }

  if (pathname === ONBOARDING_PATH) {
    if (hasWorkerOnly) {
      return NextResponse.redirect(new URL('/worker/dashboard', request.url))
    }
    if (org?.onboarding_completed) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  if (pathname.startsWith(DASHBOARD_PREFIX)) {
    if (!isOwner && !isTeamMember) {
      return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url))
    }
    if (isOwner && !org?.onboarding_completed) {
      return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url))
    }
    // SaaS isolation: redirect workers away from team management to worker view
    if (pathname.startsWith('/dashboard/team')) {
      const hasManagerRole = (memberships ?? []).some(
        (m) => m.hierarchy_level && !['worker'].includes(String(m.hierarchy_level))
      )
      if (!isOwner && !hasManagerRole && isTeamMember) {
        return NextResponse.redirect(new URL('/worker/dashboard', request.url))
      }
    }
  }

  // ========== WORKER ROUTES: require team_members (no hierarchy = incomplete profile) ==========
  if (pathname.startsWith(WORKER_PREFIX)) {
    if (!isTeamMember && !isOwner) {
      return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url))
    }
  }

  // ========== EMPLOYEE ROUTES: same check ==========
  if (pathname.startsWith(EMPLOYEE_PREFIX)) {
    if (!isTeamMember && !isOwner) {
      return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/employee/:path*',
    '/worker/:path*',
    '/api/protected/:path*',
    '/auth/:path*',
    '/login',
    '/register',
    '/onboarding',
    '/',
    '/invite/:path*',
    '/accept-invite',
  ],
}
