-- 1. Hiányzó oszlop pótlása (notification_preferences hiba: 42703)
ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'email';

-- 2. RLS Policy javítás – INFINITE RECURSION ELKERÜLÉSE
-- Töröljük a hibás policy-ket
DROP POLICY IF EXISTS "Enable read access for all users" ON organisations;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON organisations;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON organisations;
DROP POLICY IF EXISTS "organisations_select_policy" ON organisations;
DROP POLICY IF EXISTS "organisations_insert_policy" ON organisations;
DROP POLICY IF EXISTS "organisations_update_policy" ON organisations;
DROP POLICY IF EXISTS "Team members can view their org" ON organisations;
DROP POLICY IF EXISTS "Managers can view their org" ON organisations;
DROP POLICY IF EXISTS "Allow owners to view their org" ON organisations;

-- ÚJ Policy-k (NINCS szubselect önmagára!)
-- Employer lássa a saját organisation-jét (owner_id alapján)
CREATE POLICY "org_select_owner" ON organisations
FOR SELECT TO authenticated
USING (owner_id = auth.uid());

-- Team member lássa az organisation-t (közvetlen join, NINCS recursion!)
CREATE POLICY "org_select_member" ON organisations
FOR SELECT TO authenticated
USING (
  id IN (
    SELECT DISTINCT organisation_id
    FROM team_members
    WHERE user_id = auth.uid()
  )
);

-- 3. Team Members RLS javítása
DROP POLICY IF EXISTS "team_members_select_policy" ON team_members;

CREATE POLICY "team_members_select_own_org" ON team_members
FOR SELECT TO authenticated
USING (
  organisation_id IN (
    SELECT DISTINCT organisation_id
    FROM team_members tm2
    WHERE tm2.user_id = auth.uid()
  )
  OR user_id = auth.uid()
);

-- 4. organisation_audit_logs RLS (ha még nincs)
DROP POLICY IF EXISTS "audit_select_policy" ON organisation_audit_logs;
DROP POLICY IF EXISTS "Org audit logs viewable by hierarchy" ON organisation_audit_logs;

CREATE POLICY "audit_select_hierarchy" ON organisation_audit_logs
FOR SELECT TO authenticated
USING (
  organisation_id IN (
    SELECT DISTINCT organisation_id
    FROM team_members
    WHERE user_id = auth.uid()
    AND hierarchy_level IN ('employer', 'gm', 'agm')
  )
);

-- 5. Táblák frissítése
GRANT SELECT ON organisation_audit_logs TO authenticated;
GRANT INSERT ON organisation_audit_logs TO authenticated;
