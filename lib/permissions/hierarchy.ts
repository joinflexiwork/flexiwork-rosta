import type { HierarchyLevel } from '@/lib/types/hierarchy'

const LEVELS: HierarchyLevel[] = ['worker', 'shift_leader', 'agm', 'gm', 'employer']

export type { HierarchyLevel }

function indexOf(level: HierarchyLevel): number {
  const idx = LEVELS.indexOf(level)
  return idx >= 0 ? idx : 0
}

/**
 * Whether the current user can edit the target (can only edit lower hierarchy).
 */
export function canEditTarget(
  currentUserLevel: HierarchyLevel,
  targetLevel: HierarchyLevel
): boolean {
  return indexOf(currentUserLevel) > indexOf(targetLevel)
}

/**
 * Whether the current user can edit the target worker (alias for canEditTarget).
 */
export function canEditWorker(
  currentUserLevel: HierarchyLevel,
  targetWorkerLevel: HierarchyLevel
): boolean {
  return canEditTarget(currentUserLevel, targetWorkerLevel)
}

/**
 * Whether the current user can promote/assign someone to the given target level.
 */
export function canPromoteTo(
  currentUserLevel: HierarchyLevel,
  targetLevel: HierarchyLevel
): boolean {
  return indexOf(currentUserLevel) > indexOf(targetLevel)
}

/**
 * All hierarchy levels the current user is allowed to assign (levels below current).
 */
export function getAllowedLevels(currentUserLevel: HierarchyLevel): HierarchyLevel[] {
  const currentIdx = indexOf(currentUserLevel)
  return LEVELS.slice(0, currentIdx)
}

/**
 * All hierarchy levels that the current user is allowed to assign (for dropdowns).
 * Excludes 'employer' for non-owner UI.
 */
export function getAllowedPositionLevels(currentUserLevel: HierarchyLevel): HierarchyLevel[] {
  return getAllowedLevels(currentUserLevel).filter((l) => l !== 'employer')
}
