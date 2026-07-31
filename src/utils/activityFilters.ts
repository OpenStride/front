import type { Activity, ActivityFilters } from '@/types/activity'
import { toMs } from '@/utils/timeRange'

/**
 * Whether one activity answers a set of filters.
 *
 * Lives here rather than inside `ActivityService` because two corpora go
 * through it: the activities of the local store, and the merged feed that adds
 * the ones published by friends. A friend's activity carries the same handful
 * of fields, so it narrows by the same rules — a search that returned different
 * results depending on whose activity it was would be the surprise, not the
 * feature.
 */
export function matchesFilters(activity: Activity, filters: ActivityFilters): boolean {
  if (filters.text && !activity.title?.toLowerCase().includes(filters.text.toLowerCase())) {
    return false
  }

  // Legacy activities carry raw provider strings like "RUNNING"
  if (filters.sportType && activity.type?.toLowerCase() !== filters.sportType.toLowerCase()) {
    return false
  }

  if (filters.distanceMin != null && activity.distance < filters.distanceMin) return false
  if (filters.distanceMax != null && activity.distance > filters.distanceMax) return false

  // Providers disagree on whether a timestamp is seconds or milliseconds; an
  // activity stored in seconds would otherwise sit in 1970 and fall out of
  // every range.
  const startTime = toMs(activity.startTime)
  if (filters.dateFrom != null && startTime < filters.dateFrom) return false
  if (filters.dateTo != null && startTime > filters.dateTo) return false

  if (filters.durationMin != null && activity.duration < filters.durationMin) return false
  if (filters.durationMax != null && activity.duration > filters.durationMax) return false

  return true
}

/** Narrow a list, keeping its order and the concrete type of its items. */
export function applyActivityFilters<T extends Activity>(
  activities: T[],
  filters?: ActivityFilters
): T[] {
  if (!filters) return activities
  return activities.filter(activity => matchesFilters(activity, filters))
}

/**
 * What a filter panel may offer for a given corpus.
 *
 * A widget shows itself from the data it needs, not from the sport: a library
 * of pool lengths and gym sessions has no distance to narrow, so the range
 * asking for one has nothing to offer.
 */
export function filterFacets(activities: Activity[]): { sports: string[]; hasDistance: boolean } {
  const sports = new Set<string>()
  let hasDistance = false

  for (const activity of activities) {
    if (activity.type) sports.add(activity.type.toLowerCase())
    if (activity.distance > 0) hasDistance = true
  }

  return { sports: [...sports], hasDistance }
}
