# Invite flow test – joinflexiwork+8@gmail.com

Use this to verify the full invite flow for a **new** email (no prior broken state).

## Prerequisites

- [ ] Migration applied: `20260208200000_drop_team_members_user_id_fk.sql` (if you use the FK drop)
- [ ] Migration applied: `20260208100000_admin_system.sql` (if you use admin tables)
- [ ] `.env.local` has `SUPABASE_SERVICE_ROLE_KEY` (required for `/api/invite/accept`)
- [ ] Dev server running: `npm run dev`

---

## Test steps

### 1. Manager: send invite to +8

1. Log in as a **manager/owner** (org already set up).
2. Go to **Dashboard → Team** (or wherever you send invites).
3. Send an invite to: **joinflexiwork+8@gmail.com**
4. Note the invite link from the UI or from the “Share link manually” copy (e.g. `https://your-app/accept-invite?code=XXXXX&type=team`).

### 2. Accept invite (incognito)

1. Open a **new incognito/private** window.
2. Paste the **accept-invite** link (with `?code=...&type=team`).
3. You should see **“Accept Your Invite”** and the registration form (not Manager Login).
4. Fill in:
   - **Full name:** e.g. Test User 8
   - **Email:** joinflexiwork+8@gmail.com (must match invited email)
   - **Password:** at least 6 characters
5. Click **“Create Account & Join”**.
6. Expect:
   - **Success:** “Welcome to FlexiWork!” then redirect after ~2 seconds.
   - **No 500:** If you see “Failed to accept invite” or a 500, check the terminal for `[Invite Accept API]` and `user_type` / profile errors.

### 3. After redirect: confirm employee dashboard

1. After the success message you should land on **`/employee/dashboard`** (not `/dashboard/setup`).
2. If you are asked to log in again, use **joinflexiwork+8@gmail.com** and the password you just set.
3. After login you should again land on **`/employee/dashboard`** (not `/dashboard/setup`).

---

## What this verifies

| Check | Expected |
|-------|----------|
| Profile created with `user_type: 'employee'` | No “null value in column 'user_type'” in terminal |
| Team member linked | `team_members.user_id` set; invite status accepted |
| Post-signup redirect | Goes to `/employee/dashboard` |
| Post-login redirect | Still `/employee/dashboard` (not `/dashboard/setup`) |

---

## If something fails

- **500 on accept:** Check terminal for `[Invite Accept API] profile upsert error` or `team_members update error`. Ensure `user_type` and any other NOT NULL profile columns are set in `app/api/invite/accept/route.ts`.
- **Redirect to /dashboard/setup:** Dashboard layout should redirect users with `team_members` but no org to `/employee/dashboard`. Confirm `hasTeamMembership()` and the redirect in `app/dashboard/layout.tsx` and `app/dashboard/page.tsx`.
- **“Invalid or expired invite”:** Ensure the link has `code=...` and the invite in the DB for +8 is still `status = 'pending'` and the code matches.
