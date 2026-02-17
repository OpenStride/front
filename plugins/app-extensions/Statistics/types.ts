export interface PersonalRecord {
  distance: number
  distanceLabel: string
  duration: number
  pace: number
  speed: number
  date: number
  activityId: string
}

export interface PRCache {
  activityCount: number
  maxLastModified: number
  sport: string
  records: PersonalRecord[]
}

export type PeriodGranularity = 'week' | 'month' | 'year'

export type HeatmapMetric = 'distance' | 'duration' | 'count'

/** Convert startTime to milliseconds (handles both seconds and ms formats) */
export function toMs(timestamp: number): number {
  return timestamp < 1e11 ? timestamp * 1000 : timestamp
}

export interface PeriodData {
  key: string
  label: string
  distance: number
  duration: number
  count: number
}
