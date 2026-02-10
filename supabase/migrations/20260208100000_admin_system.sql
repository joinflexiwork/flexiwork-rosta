-- Admin users table (extends existing profiles)
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'moderator')),
  permissions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Audit logs for admin actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL, -- 'user', 'shift', 'venue', 'email_template'
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Email templates for system emails
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text,
  variables jsonb DEFAULT '[]'::jsonb, -- ['user_name', 'venue_name', etc.]
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- System logs (for admin monitoring)
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
  source text NOT NULL, -- 'api', 'auth', 'database', 'email'
  message text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Analytics snapshots (for charts)
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  metric_type text NOT NULL, -- 'retention', 'engagement', 'conversion', 'active_users'
  value numeric NOT NULL,
  breakdown jsonb -- { venue_id: 'uuid', role: 'barista' }
);

-- RLS policies
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Only admins can read admin tables
CREATE POLICY "Admins can read admin_users" ON admin_users
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "Super admins can manage admin_users" ON admin_users
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin'));

CREATE POLICY "Admins can read audit_logs" ON audit_logs
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE POLICY "Admins can manage email_templates" ON email_templates
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- Insert default email templates
INSERT INTO email_templates (name, subject, html_body, variables) VALUES
('welcome_employee', 'Welcome to FlexiWork!', '<h1>Welcome {{user_name}}!</h1><p>You have been invited to join {{organisation_name}} as a {{role}}.</p>', '["user_name", "organisation_name", "role"]'),
('shift_reminder', 'Upcoming Shift Reminder', '<h1>Hello {{user_name}}</h1><p>You have a shift tomorrow at {{venue_name}} from {{start_time}} to {{end_time}}.</p>', '["user_name", "venue_name", "start_time", "end_time"]'),
('password_reset', 'Password Reset Request', '<h1>Password Reset</h1><p>Click <a href="{{reset_link}}">here</a> to reset your password.</p>', '["reset_link"]')
ON CONFLICT (name) DO NOTHING;
