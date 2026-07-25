import type { MetricDefinition } from './types'

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

/**
 * Direct metrics only: every value is read straight from the activity or from
 * its stored stats. Derived metrics (time on 10K & co) need the analyzer over
 * the samples and will land with the persisted per-activity index.
 */
export const METRICS: MetricDefinition[] = [
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

export function getMetric(id: string): MetricDefinition {
  return METRICS.find(m => m.id === id) ?? METRICS[0]
}
