-- Add created_at to shift_allocations so schedule/allocations queries that order by created_at work.
-- Table currently has allocated_at; created_at is used by getMyAllocatedShifts and others.

ALTER TABLE shift_allocations
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill from allocated_at where created_at would be null (e.g. existing rows)
UPDATE shift_allocations
  SET created_at = COALESCE(allocated_at, NOW())
  WHERE created_at IS NULL;
