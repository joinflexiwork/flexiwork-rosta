# Manual Test Scenarios - Invitation & Hierarchy

## Scenario 1: Employer invites Worker

1. Login as employer (owner)
2. Go to Team → Invite (or /dashboard/team/invites)
3. Enter email: test.worker@example.com
4. Select hierarchy: worker
5. Click Send
6. **Expected**: Success message, invite appears in list
7. Check email (if configured) or copy invite link
8. Open invite link in incognito window
9. Register new account with invited email
10. **Expected**: New user becomes worker in organisation

## Scenario 2: Worker tries to invite Employer (should fail)

1. Login as worker
2. Try to access invite functionality
3. **Expected**: No invite button visible, or error if accessed via URL

## Scenario 3: GM invites AGM

1. Login as GM
2. Try to invite employer
3. **Expected**: Error - cannot invite higher rank
4. Try to invite AGM
5. **Expected**: Success
6. Try to invite another GM
7. **Expected**: Error - cannot invite same rank

## Scenario 4: Invite expiration

1. Create invite
2. Wait 7 days (or manually update DB: `UPDATE invites SET expires_at = now() - interval '1 day' WHERE id = '...'`)
3. Try to accept expired invite
4. **Expected**: "Invite expired" or "Invalid, expired or already used invite token" error

## Scenario 5: Hierarchy change audit

1. Change worker to shift_leader in employer dashboard (Workers → [worker] → Edit → hierarchy)
2. Check audit log
3. **Expected**: UPDATE or ROLE_CHANGED entry with old/new values

## Scenario 6: Duplicate invite prevention

1. Invite same email twice for the same organisation
2. **Expected**: Second invite should either fail or revoke first (check implementation)

## Scenario 7: Invite accepted

1. Create invite as employer
2. Open invite link in incognito
3. Sign up with invited email
4. **Expected**: User is added to team_members with correct hierarchy_level
5. **Expected**: Invite status changes to 'accepted'
