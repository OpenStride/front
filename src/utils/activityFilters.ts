import type { Activity, ActivityFilters } from '@/types/activity'
import { toMs } from '@/utils/timeRange'
import { sportScopes, matchesSportScope } from '@/types/sport'

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
/** An activity's ascent in metres, when it is known. */
export type AscentLookup = (activityId: string) => number | undefined

export function matchesFilters(
  activity: Activity,
  filters: ActivityFilters,
  ascentOf?: AscentLookup
): boolean {
  if (filters.text && !activity.title?.toLowerCase().includes(filters.text.toLowerCase())) {
    return false
  }

  // Canonical on both sides (legacy activities carry raw strings like "RUNNING"),
  // and "running" takes in trails, as a runner counts them.
  if (filters.sportType && !matchesSportScope(filters.sportType, activity.type)) {
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

  // A climb filter asks something only the details know; an activity whose
  // ascent is not known (yet, or ever: a friend's, a pool swim) cannot answer.
  if (filters.climbMin != null || filters.climbMax != null) {
    const ascent = ascentOf?.(activity.id)
    if (ascent === undefined || !(activity.distance > 0)) return false
    const climb = ascent / activity.distance
    if (filters.climbMin != null && climb < filters.climbMin) return false
    if (filters.climbMax != null && climb > filters.climbMax) return false
  }

  return true
}

/** Narrow a list, keeping its order and the concrete type of its items. */
export function applyActivityFilters<T extends Activity>(
  activities: T[],
  filters?: ActivityFilters,
  ascentOf?: AscentLookup
): T[] {
  if (!filters) return activities
  return activities.filter(activity => matchesFilters(activity, filters, ascentOf))
}

/** Whether these filters need each activity's ascent. */
export const filtersNeedAscent = (filters?: ActivityFilters): boolean =>
  filters?.climbMin != null || filters?.climbMax != null

/**
 * What a filter panel may offer for a given corpus.
 *
 * A widget shows itself from the data it needs, not from the sport: a library
 * of pool lengths and gym sessions has no distance to narrow, so the range
 * asking for one has nothing to offer.
 */
export function filterFacets(activities: Activity[]): { sports: string[]; hasDistance: boolean } {
  const hasDistance = activities.some(activity => activity.distance > 0)
  return { sports: sportScopes(activities.map(activity => activity.type)), hasDistance }
}
