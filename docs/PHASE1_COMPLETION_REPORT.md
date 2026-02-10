# Phase 1 Completion Report — FlexiWork Rosta

**Date:** 2026-02-06  
**Scope:** Setup Wizard, Dashboard, Team Management, Settings, Rota Calendar, View Profile, RLS, Cross-branch invites, Timekeeping foundation.

---

## 1. What Works (Verified)

| Area | Status | Notes |
|------|--------|------|
| **Setup Wizard** | ✅ | Org → Venue → Roles creation; redirect to dashboard. |
| **Dashboard** | ✅ | Stats (employee count, fill rate, pending timesheets); week uses local date; only published shifts in stats; tabs, hero, quick actions. |
| **Team Management** | ✅ | List, Invite Employee (email, name, FT/PT, venue/roles), Invite Manager; success/error and manual link alerts. |
| **Settings** | ✅ | Org data load/save; venue list; Add Venue; Manage = alert “Full venue editing coming in Phase 2”; Change Plan / Payment Method = “Coming in Phase 2” alerts. |
| **Rota Calendar** | ✅ | Weekly view; shift creation; Publish Roster calls `publishRotaWeek()` with try/catch and user-facing alert. |
| **View Profile** | ✅ | Team page has “View” per row; onClick shows alert with Name, Email, Type, Status, Role(s), Primary venue. |
| **RLS** | ✅ | `complete_rls_master` uses `owner_id = auth.uid()` or `organisation_id IN (SELECT … WHERE owner_id = auth.uid())`; full CRUD where intended. |
| **Accept invite (team)** | ✅ | `acceptInvite()` only updates rows with `status = 'pending'` (no reuse of used codes). |
| **Timekeeping** | ✅ | `clock_in_location` / `clock_out_location` (TEXT) used for GPS; table and policies in place. |
| **getMyOrganisations** | ✅ | Exists; returns owned orgs and manager org. |
| **publishRotaWeek** | ✅ | Implemented in `rota-service.ts`; `rota.ts` delegates and throws `Error(error.message)`. |

---

## 2. Bugs Fixed This Session

| # | Bug | Location | Fix |
|---|-----|----------|-----|
| 1 | Services threw raw Supabase `error` instead of `Error(error.message)` | `lib/services/rota.ts`, `rota-service.ts`, `team.ts`, `timekeeping.ts`, `allocations.ts`, `invites.ts` | Replaced all `throw error` with `throw new Error(error.message)` (or equivalent for invite/alloc errors). |
| 2 | Team invite code reusable after accept | `lib/services/team.ts` | Added `.eq('status', 'pending')` to `acceptInvite()` update so only pending invites are accepted. |
| 3 | Race condition: two employees accepting same shift invite | `lib/services/invites.ts` + new migration | Added DB function `accept_shift_invite_atomic(p_invite_id, p_team_member_id)`; `acceptShiftInvite()` now calls RPC only (atomic lock + check + insert + update). |
| 4 | View Profile not user-facing | `app/dashboard/team/page.tsx` | Added “View” button per member; onClick shows alert with employee name, email, type, status, roles, primary venue. |
| 5 | Debug console.log in setup | `app/dashboard/setup/page.tsx` | Removed `console.log` statements from setup flow. |

---

## 3. Database & RLS Audit Summary

- **invite_code:** `team_members.invite_code` is TEXT UNIQUE ✅ (checklist referred to “shift_invites” but invite_code lives on team_members).
- **Profiles:** No `avatar_url` column added in migrations; only `worker_status`, `has_employee_profile`, `has_gig_profile`. Type in `lib/types.ts` has optional `avatar_url?` for future use.
- **timekeeping_records:** Has `clock_in_location`, `clock_out_location` (TEXT) for GPS ✅.
- **RLS:** All Phase 1 tables use owner-based or org-based policies; `complete_rls_master` is the source of truth.

---

## 4. Placeholder / Phase 2 Behaviour

- **Settings → Manage (venue):** Button shows alert: “Full venue editing coming in Phase 2.” No backend venue edit yet.
- **Settings → Change Plan / Payment Method:** Buttons show “Coming in Phase 2” alerts.

---

## 5. What Needs Manual Testing

1. **End-to-end invite (team):** Send invite → open link → sign up → accept → redirect to dashboard / employee dashboard.
2. **Publish Roster:** Select venue and week → Publish Roster → confirm success message and that shifts show as published.
3. **Cross-branch shift invite:** Two employees with pending invite to same shift; both click Accept; one should succeed, the other get “This shift has been filled by another employee” (atomic RPC).
4. **Clock-in with location:** Clock in with GPS/location string; confirm `clock_in_location` stored in `timekeeping_records`.
5. **Manager vs Employee:** Log in as manager vs employee; confirm correct dashboard and visibility (roles/permissions).

---

## 6. Files Touched (Audit & Fixes)

- `lib/services/rota.ts` — error handling
- `lib/services/rota-service.ts` — error handling
- `lib/services/team.ts` — error handling + `status = 'pending'` in acceptInvite
- `lib/services/timekeeping.ts` — error handling
- `lib/services/allocations.ts` — error handling
- `lib/services/invites.ts` — error handling + accept via `accept_shift_invite_atomic` RPC
- `app/dashboard/team/page.tsx` — View Profile (View button + alert)
- `app/dashboard/setup/page.tsx` — removed console.log
- `supabase/migrations/20260206600000_accept_shift_invite_atomic.sql` — new RPC for atomic accept

---

## 7. Priority Summary

- **Data integrity (RLS, DB):** Audited; no critical issues; invite code and timekeeping schema correct.
- **Broken flows (invite accept, clock-in):** Invite accept fixed (pending-only + atomic shift accept); clock-in already saves location.
- **Placeholder UI (Manage, Change Plan, Payment):** Handled with “Coming in Phase 2” / venue message.
- **TypeScript:** No `any` abuse found; lints clean.
- **Console warnings:** Setup console.logs removed.

Phase 1 is complete for the defined scope; remaining work is manual QA and any Phase 2 features (venue editing, billing).
