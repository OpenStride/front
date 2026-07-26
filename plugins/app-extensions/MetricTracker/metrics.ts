import { DISTANCE_TARGETS, timeMetricId } from '@/composables/useActivityMetricsIndex'
import type { MetricDefinition } from './types'

export { DISTANCE_TARGETS, timeMetricId }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Minutes -> "1h30" / "45 min" */
function formatMinutes(minutes: number): string {
  if (!isFinite(minutes)) return '-'
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h${pad(m)}` : `${m} min`
}

/** Minutes per km -> "4'35\"" */
function formatPace(minPerKm: number): string {
  if (!isFinite(minPerKm) || minPerKm <= 0) return '-'
  let m = Math.floor(minPerKm)
  let s = Math.round((minPerKm - m) * 60)
  if (s === 60) {
    m += 1
    s = 0
  }
  return `${m}'${pad(s)}"`
}

function rounded(unit: string) {
  return (value: number) => `${Math.round(value)} ${unit}`
}

/** Seconds -> "42:31" / "3:12:45" */
function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '-'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Best time on a fixed distance — the whole point of the index */
export const DERIVED_METRICS: MetricDefinition[] = DISTANCE_TARGETS.map(target => ({
  id: timeMetricId(target.meters),
  sourceRef: `derived.${timeMetricId(target.meters)}`,
  periodOp: 'min',
  betterIsLower: true,
  distanceLabel: target.label,
  toDisplay: raw => raw,
  format: formatDuration
}))

/**
 * Direct metrics: every value is read straight from the activity or from its
 * stored stats, so they need no index and no sample scan.
 */
export const DIRECT_METRICS: MetricDefinition[] = [
  {
    id: 'distance',
    sourceRef: 'distance',
    periodOp: 'sum',
    toDisplay: raw => raw / 1000,
    format: value => `${value.toFixed(1)} km`
  },
  {
    id: 'duration',
    sourceRef: 'duration',
    periodOp: 'sum',
    toDisplay: raw => raw / 60,
    format: formatMinutes
  },
  {
    id: 'pace',
    sourceRef: 'distance',
    denominatorRef: 'duration',
    periodOp: 'ratio',
    betterIsLower: true,
    // m/s -> min/km
    toDisplay: raw => 1000 / raw / 60,
    format: formatPace
  },
  {
    id: 'speed',
    sourceRef: 'distance',
    denominatorRef: 'duration',
    periodOp: 'ratio',
    toDisplay: raw => raw * 3.6,
    format: value => `${value.toFixed(1)} km/h`
  },
  {
    id: 'maxHeartRate',
    sourceRef: 'stats.maxHeartRate',
    periodOp: 'max',
    toDisplay: raw => raw,
    format: rounded('bpm')
  },
  {
    id: 'avgHeartRate',
    sourceRef: 'stats.averageHeartRate',
    periodOp: 'avg',
    toDisplay: raw => raw,
    format: rounded('bpm')
  },
  {
    id: 'totalAscent',
    sourceRef: 'stats.totalAscent',
    periodOp: 'sum',
    toDisplay: raw => raw,
    format: rounded('m')
  },
  {
    id: 'calories',
    sourceRef: 'stats.calories',
    periodOp: 'sum',
    toDisplay: raw => raw,
    format: rounded('kcal')
  }
]

export const METRICS: MetricDefinition[] = [...DIRECT_METRICS, ...DERIVED_METRICS]

export function getMetric(id: string): MetricDefinition {
  return METRICS.find(m => m.id === id) ?? METRICS[0]
}

export function hasMetric(id: string): boolean {
  return METRICS.some(m => m.id === id)
}
