import { calendarRange, openRange, type KeyedTimeRange } from '@/utils/timeRange'

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

/** The records only ever use keyed windows, so their cache stays safe to key */
export type RecordPeriodRange = KeyedTimeRange

/** Calendar bounds of the current month / quarter / year, in local time */
export function getRecordPeriodRange(
  period: RecordPeriod,
  now: Date = new Date()
): RecordPeriodRange {
  return period === 'all' ? openRange() : calendarRange(period, now)
}

export { toMs } from '@/utils/timeRange'


export type HeatmapMetric = 'distance' | 'duration' | 'count'

export interface PeriodData {
  key: string
  label: string
  distance: number
  duration: number
  count: number
}
