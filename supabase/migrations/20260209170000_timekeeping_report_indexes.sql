-- Indexes for timesheet reporting (date range queries on timekeeping_records)
CREATE INDEX IF NOT EXISTS idx_timekeeping_clock_in ON timekeeping_records(clock_in);
CREATE INDEX IF NOT EXISTS idx_timekeeping_venue_clock_in ON timekeeping_records(venue_id, clock_in);
CREATE INDEX IF NOT EXISTS idx_timekeeping_team_member_clock_in ON timekeeping_records(team_member_id, clock_in);
