-- Organisation-scoped audit logs (separate from admin-only audit_logs).
-- Employer/GM/AGM can view who changed what within their organisation.

CREATE TABLE organisation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'INVITE_SENT', 'ROLE_CHANGED', 'SHIFT_ASSIGNED')),
  old_data JSONB,
  new_data JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_org_audit_org_id ON organisation_audit_logs(organisation_id);
CREATE INDEX idx_org_audit_created ON organisation_audit_logs(created_at DESC);
CREATE INDEX idx_org_audit_user ON organisation_audit_logs(user_id);
CREATE INDEX idx_org_audit_record ON organisation_audit_logs(table_name, record_id);

ALTER TABLE organisation_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org audit logs viewable by hierarchy" ON organisation_audit_logs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.organisation_id = organisation_audit_logs.organisation_id
    AND tm.hierarchy_level IN ('employer', 'gm', 'agm')
  )
);

CREATE POLICY "Users can insert own audit logs" ON organisation_audit_logs
FOR INSERT WITH CHECK (user_id = auth.uid());
