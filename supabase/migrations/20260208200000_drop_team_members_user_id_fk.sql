-- URGENT: Remove FK that blocks invite acceptance.
-- team_members.user_id -> profiles(id) causes "violates foreign key constraint" when
-- profile row doesn't exist yet (auth trigger timing). Dropping allows invite flow
-- to succeed; profile can be created/backfilled by API or trigger.
ALTER TABLE team_members
  DROP CONSTRAINT IF EXISTS team_members_user_id_fkey;
