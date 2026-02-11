# Hierarchy & Notifications – Implementation Checklist

## 1. Middleware & env
- [ ] Copy `.env.example` to `.env.local` and set real values (including optional `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` for Web Push).
- [ ] Test in incognito: open `/dashboard` or `/employee/dashboard` without being logged in → redirect to `/login`.
- [ ] Log in and open `/login` again → redirect to `/dashboard`.

## 2. Database
- [ ] Run migration `supabase/migrations/20250210000000_add_hierarchy.sql` in Supabase SQL Editor (or `supabase db push`).
- [ ] Confirm tables: `management_chain`, `permissions`, `notification_preferences`, `push_subscriptions`; columns on `team_members`: `hierarchy_level`, `invited_by`, `can_invite_managers`, `venue_scope`.

## 3. Hierarchy
- [ ] Only employer (or higher) can invite GM; GM can invite AGM/Shift Leader.
- [ ] Team page shows **Team hierarchy** section and **Invite manager** opens the new modal (level + venue assignment).
- [ ] PermissionGuard blocks content when user lacks required level/permission.

## 4. Notifications
- [ ] Notification bell in header shows count and dropdown; real-time subscription updates the list.
- [ ] **Mark all as read** (if added to the bell) works.
- [ ] `/dashboard/settings/notifications` opens; toggles and Quiet Hours save without error (after migration).

## 5. Integrations
- [ ] Accepting a **manager** invite creates an in-app notification (`manager_invite_received`).
- [ ] **updateHierarchyLevel** (e.g. from team profile) creates `hierarchy_changed` for the affected user.

## Security
- [ ] RLS is enabled on all new tables; users only see their own notifications/preferences/subscriptions and their org’s management chain.
- [ ] Server actions always check session; only higher hierarchy level can change a member’s level.
