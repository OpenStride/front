import type { Activity } from '@/types/activity'
import { periodKey } from '@/utils/dateKeys'
import {
  toMs,
  type Granularity,
  type MetricDefinition,
  type MetricSources,
  type MetricSourceRef,
  type SeriesPoint
} from './types'

interface Bucket {
  startTime: number
  numerators: number[]
  denominators: number[]
}

/** Read a metric path against the activity, its stats or the derived index */
function readValue(
  activity: Activity,
  sources: MetricSources,
  path: MetricSourceRef
): number | null {
  let value: unknown

  if (path.startsWith('stats.')) {
    value = sources.stats.get(activity.id)?.[path.slice('stats.'.length)]
  } else if (path.startsWith('derived.')) {
    value = sources.derived.get(activity.id)?.[path.slice('derived.'.length)]
  } else {
    value = (activity as unknown as Record<string, unknown>)[path]
  }

  return typeof value === 'number' && isFinite(value) ? value : null
}

function bucketKey(activity: Activity, date: Date, granularity: Granularity): string {
  return granularity === 'activity' ? activity.id : periodKey(date, granularity)
}

function reduce(metric: MetricDefinition, bucket: Bucket): number | null {
  const values = bucket.numerators
  if (values.length === 0) return null

  switch (metric.periodOp) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'min':
      return values.reduce((a, b) => Math.min(a, b))
    case 'max':
      return values.reduce((a, b) => Math.max(a, b))
    case 'ratio': {
      const denominator = bucket.denominators.reduce((a, b) => a + b, 0)
      return denominator > 0 ? values.reduce((a, b) => a + b, 0) / denominator : null
    }
  }
}

/**
 * Group activities into buckets and collapse each one into a plot-ready point.
 *
 * A bucket that holds activities but no usable value keeps its slot with a null
 * value, so the chart shows a gap rather than silently shifting the timeline.
 */
export function buildSeries(
  activities: Activity[],
  sources: MetricSources,
  metric: MetricDefinition,
  granularity: Granularity
): SeriesPoint[] {
  const buckets = new Map<string, Bucket>()

  for (const activity of activities) {
    const startTime = toMs(activity.startTime)
    if (!isFinite(startTime)) continue

    const key = bucketKey(activity, new Date(startTime), granularity)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { startTime, numerators: [], denominators: [] }
      buckets.set(key, bucket)
    }
    if (startTime < bucket.startTime) bucket.startTime = startTime

    const numerator = readValue(activity, sources, metric.sourceRef)
    if (numerator === null) continue

    if (metric.denominatorRef) {
      const denominator = readValue(activity, sources, metric.denominatorRef)
      if (denominator === null || denominator <= 0) continue
      bucket.numerators.push(numerator)
      bucket.denominators.push(denominator)
    } else {
      bucket.numerators.push(numerator)
    }
  }

  return Array.from(buckets.entries())
    .map(([key, bucket]) => {
      const raw = reduce(metric, bucket)
      return {
        key,
        startTime: bucket.startTime,
        value: raw === null ? null : metric.toDisplay(raw),
        count: bucket.numerators.length
      }
    })
    .sort((a, b) => a.startTime - b.startTime)
}

const DAY_MS = 86_400_000

/**
 * Least-squares trend over the points that carry a value.
 *
 * The fit runs on real timestamps rather than on the point index, so a burst of
 * outings in one week and a six-month gap don't weigh the same. Returns one
 * value per point — including the gaps — so the line spans the whole chart.
 * Null everywhere when there is nothing to fit.
 */
export function trendLine(points: SeriesPoint[]): (number | null)[] {
  const valued = points.filter((p): p is SeriesPoint & { value: number } => p.value !== null)
  if (valued.length < 2) return points.map(() => null)

  // Days since the first point: keeps the numbers small enough to stay precise
  const origin = valued[0].startTime
  const days = (startTime: number) => (startTime - origin) / DAY_MS

  const meanX = valued.reduce((sum, p) => sum + days(p.startTime), 0) / valued.length
  const meanY = valued.reduce((sum, p) => sum + p.value, 0) / valued.length

  let covariance = 0
  let variance = 0
  for (const point of valued) {
    const dx = days(point.startTime) - meanX
    covariance += dx * (point.value - meanY)
    variance += dx * dx
  }

  // Every point on the same day — no slope to speak of
  if (variance === 0) return points.map(() => meanY)

  const slope = covariance / variance
  return points.map(p => meanY + slope * (days(p.startTime) - meanX))
}

/** Best / average of the points that carry a value, in display unit */
export function summarize(points: SeriesPoint[], metric: MetricDefinition) {
  const values = points.map(p => p.value).filter((v): v is number => v !== null)
  if (values.length === 0) return null

  return {
    count: values.length,
    best: metric.betterIsLower ? Math.min(...values) : Math.max(...values),
    average: values.reduce((a, b) => a + b, 0) / values.length
  }
}
