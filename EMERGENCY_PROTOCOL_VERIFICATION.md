# Emergency Protocol – Verification Checklist

## Phase 1: Database Migration ✅

**File:** `supabase/migrations/20260217100000_fix_rls_recursion.sql`

**Run in Supabase:**
```bash
supabase db push
# or apply via Supabase Dashboard SQL Editor
```

**Verification:**
- [ ] Migration runs without errors
- [ ] No "infinite recursion" errors in Supabase logs
- [ ] Existing SELECT policies remain (team listing, profiles visible)

---

## Phase 2: Server Action ✅

**File:** `app/actions/team-member-actions.ts`

**Verification:**
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
- [ ] Owner can edit any hierarchy level (checks `organisations.owner_id` first)
- [ ] GM can edit AGM, Shift Leader, Worker (not other GMs)
- [ ] AGM can edit Shift Leader, Worker (not GMs)
- [ ] Audit logs are created in `organisation_audit_logs`

---

## Phase 3: Frontend ✅

**File:** `app/dashboard/workers/[id]/page.tsx`

**Verification:**
- [ ] Save button invokes `updateTeamMemberComplete` (server action)
- [ ] Success toast shows on save
- [ ] Error message displays on failure
- [ ] Edit mode closes on success
- [ ] Data refreshes after save

---

## Phase 4: Environment ✅

**Required in `.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # REQUIRED for worker profile edits
```

---

## Full System Verification

- [ ] Invite system still creates/accepts invites (unchanged)
- [ ] Team page still lists all members
- [ ] Owner can edit any hierarchy level
- [ ] GM cannot edit other GM (same level)
- [ ] GM cannot promote above GM level
- [ ] Audit logs show field-level changes
- [ ] Console shows ZERO 500 errors
- [ ] Console shows ZERO "infinite recursion" errors

---

## Execution Order

1. **Phase 1** → Run SQL migration
2. **Phase 2** → Server action already created (verify env)
3. **Phase 3** → Frontend already updated
4. **Phase 4** → Verify `.env.local` has `SUPABASE_SERVICE_ROLE_KEY`
5. **Final** → Run full checklist above
