export interface PersonalRecord {
  distance: number
  distanceLabel: string
  duration: number
  pace: number
  speed: number
  date: number
  activityId: string
}

export type RecordPeriod = 'all' | 'month' | 'quarter' | 'year'

export const RECORD_PERIODS: RecordPeriod[] = ['all', 'month', 'quarter', 'year']

export interface RecordPeriodRange {
  /** Identifies the period instance (e.g. "2026-07"), so a cache entry expires on rollover */
  key: string
  /** Inclusive lower bound in ms, null for all-time */
  start: number | null
  /** Exclusive upper bound in ms, null for all-time */
  end: number | null
}

export interface PRCacheEntry {
  periodKey: string
  records: PersonalRecord[]
}

export interface PRCache {
  activityCount: number
  maxLastModified: number
  sport: string
  /** One entry per RecordPeriod, computed lazily when the user selects it */
  periods: Partial<Record<RecordPeriod, PRCacheEntry>>
}

export type PeriodGranularity = 'week' | 'month' | 'year'

export type HeatmapMetric = 'distance' | 'duration' | 'count'

/** Convert startTime to milliseconds (handles both seconds and ms formats) */
export function toMs(timestamp: number): number {
  return timestamp < 1e11 ? timestamp * 1000 : timestamp
}

/** Calendar bounds of the current month / quarter / year, in local time */
export function getRecordPeriodRange(
  period: RecordPeriod,
  now: Date = new Date()
): RecordPeriodRange {
  const year = now.getFullYear()

  if (period === 'month') {
    const month = now.getMonth()
    return {
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      start: new Date(year, month, 1).getTime(),
      end: new Date(year, month + 1, 1).getTime()
    }
  }

  if (period === 'quarter') {
    const quarter = Math.floor(now.getMonth() / 3)
    return {
      key: `${year}-Q${quarter + 1}`,
      start: new Date(year, quarter * 3, 1).getTime(),
      end: new Date(year, quarter * 3 + 3, 1).getTime()
    }
  }

  if (period === 'year') {
    return {
      key: `${year}`,
      start: new Date(year, 0, 1).getTime(),
      end: new Date(year + 1, 0, 1).getTime()
    }
  }

  return { key: 'all', start: null, end: null }
}

export interface PeriodData {
  key: string
  label: string
  distance: number
  duration: number
  count: number
}
