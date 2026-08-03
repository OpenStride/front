import { DISTANCE_TARGETS, timeMetricId } from '@/composables/useActivityMetricsIndex'
import { convertQuantity } from '@/composables/useUnits'
import type { Dimension } from '@/types/units'
import type { MetricDefinition } from './types'
import { formatClock, formatCompactDuration } from '@/utils/duration'

export { DISTANCE_TARGETS, timeMetricId }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Minutes -> "1h30" / "45 min". The shared helper counts in seconds. */
function formatMinutes(minutes: number): string {
  return formatCompactDuration(minutes * 60)
}

/** Minutes per display unit -> "4'35\"" */
function formatPace(minPerUnit: number): string {
  if (!isFinite(minPerUnit) || minPerUnit <= 0) return '-'
  let m = Math.floor(minPerUnit)
  let s = Math.round((minPerUnit - m) * 60)
  if (s === 60) {
    m += 1
    s = 0
  }
  return `${m}'${pad(s)}"`
}

function rounded(unit: string) {
  return (value: number) => `${Math.round(value)} ${unit}`
}

/**
 * Build the display pair for a unit-dependent metric.
 *
 * The conversion factors live in the units layer; restating them here is how a
 * user set to imperial ends up reading kilometres in their own statistics.
 * `toDisplay` feeds the chart axis, `format` the labels — both from one source.
 */
function inUnits(dimension: Dimension, decimals = 1) {
  return {
    toDisplay: (raw: number) => convertQuantity(dimension, raw).value,
    format: (value: number) => {
      const { unit } = convertQuantity(dimension, 0)
      return `${value.toFixed(decimals)} ${unit}`
    }
  }
}

/** Best time on a fixed distance — the whole point of the index */
export const DERIVED_METRICS: MetricDefinition[] = DISTANCE_TARGETS.map(target => ({
  id: timeMetricId(target.meters),
  sourceRef: `derived.${timeMetricId(target.meters)}`,
  periodOp: 'min',
  betterIsLower: true,
  distanceLabel: target.label,
  toDisplay: raw => raw,
  format: formatClock
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
    ...inUnits('distance')
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
    // raw is m/s; the units layer takes s/m and yields seconds per km or per mile,
    // which the chart axis reads in minutes. Only the conversion is shared — the
    // "4'35\"" styling is this panel's own.
    toDisplay: raw => (raw > 0 ? convertQuantity('pace', 1 / raw).value / 60 : NaN),
    format: minutes => `${formatPace(minutes)} ${convertQuantity('pace', 1).unit}`
  },
  {
    id: 'speed',
    sourceRef: 'distance',
    denominatorRef: 'duration',
    periodOp: 'ratio',
    ...inUnits('speed')
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
    ...inUnits('elevation', 0)
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
