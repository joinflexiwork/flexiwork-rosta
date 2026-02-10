-- Add Gig Platform feature toggle to organisation_settings (hidden by default)
ALTER TABLE organisation_settings
ADD COLUMN IF NOT EXISTS show_gig_features boolean DEFAULT false;
