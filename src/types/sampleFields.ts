import type { Sample } from './activity'
import type { Dimension } from './units'
import { deriveSeries } from '@/utils/derivedSamples'

/**
 * The raw channels a `Sample` may carry.
 *
 * "May" is the whole point: a treadmill run has no elevation, a road bike
 * without a meter has no power, an old Strava import has no cadence. Which of
 * these a given library actually holds is not something this file can know —
 * it is measured, by `summarizeSamples` below.
 */
export const SAMPLE_CHANNELS = [
  'speed',
  'heartRate',
  'cadence',
  'power',
  'elevation',
  'temperature',
  'distance'
] as const

export type SampleChannel = (typeof SAMPLE_CHANNELS)[number]

/**
 * The vocabulary an aggregate definition may name.
 *
 * Persisted inside definitions, so these strings are a contract: adding one is
 * safe, renaming one turns every stored definition that used it into a filter
 * matching nothing.
 *
 * Not the same list as the channels. `distance` is a channel but not a field —
 * it is monotonic, so filtering or averaging it says nothing; it earns its
 * place by being what `slope` and `speed` are recovered from. `slope` is the
 * mirror case: never stored, always available wherever elevation and distance
 * are.
 */
export const SAMPLE_FIELDS = [
  'slope',
  'speed',
  'heartRate',
  'cadence',
  'power',
  'elevation',
  'temperature'
] as const

export type SampleField = (typeof SAMPLE_FIELDS)[number]

export function isSampleField(value: string): value is SampleField {
  return (SAMPLE_FIELDS as readonly string[]).includes(value)
}

export interface SampleFieldSpec {
  id: SampleField
  /** Locale key. The field names are ours, so they are translated. */
  labelKey: string
  /** Passed to `units.format`; absent for a dimensionless ratio like a slope. */
  dimension?: Dimension
  /** The channel read straight off the sample, when the samples carry it. */
  channel?: SampleChannel
  /**
   * Channel sets this field can be recovered from when its own channel is
   * missing. Alternatives, not a single list: speed comes from a speed channel
   * *or* from the distance trace.
   */
  computableFrom?: SampleChannel[][]
}

export const SAMPLE_FIELD_SPECS: Record<SampleField, SampleFieldSpec> = {
  slope: {
    id: 'slope',
    labelKey: 'sampleFields.slope',
    // A ratio, not a measurement: 0.05 is 5% to everyone, metric or imperial.
    computableFrom: [['elevation', 'distance']]
  },
  speed: {
    id: 'speed',
    labelKey: 'sampleFields.speed',
    dimension: 'speed',
    channel: 'speed',
    computableFrom: [['distance']]
  },
  heartRate: { id: 'heartRate', labelKey: 'sampleFields.heartRate', channel: 'heartRate' },
  cadence: { id: 'cadence', labelKey: 'sampleFields.cadence', channel: 'cadence' },
  power: { id: 'power', labelKey: 'sampleFields.power', channel: 'power' },
  elevation: {
    id: 'elevation',
    labelKey: 'sampleFields.elevation',
    dimension: 'elevation',
    channel: 'elevation'
  },
  temperature: {
    id: 'temperature',
    labelKey: 'sampleFields.temperature',
    dimension: 'temperature',
    channel: 'temperature'
  }
}

/**
 * Histogram edges per channel, SI, ascending.
 *
 * Fixed rather than fitted to the data, because a summary is only mergeable if
 * every activity used the same buckets: recomputing edges per library would
 * mean rescanning every activity each time one is imported. Values outside the
 * range fall into the end buckets, which is also how a GPS glitch reporting
 * 400 km/h stops dragging the whole scale with it.
 *
 * `distance` has none: a cumulative counter has no distribution worth reading.
 * It is still summarized, because whether it is *present* is what decides
 * whether slope and speed can be recovered — presence and distribution are two
 * different questions, and only the second one needs buckets.
 */
export const CHANNEL_EDGES: Partial<Record<SummaryKey, number[]>> = {
  // Rise over run, as a ratio: -20% to +20% covers everything a human climbs,
  // and the open ends absorb the cliffs a bad altimeter invents.
  slope: [-0.2, -0.15, -0.1, -0.06, -0.03, -0.01, 0.01, 0.03, 0.06, 0.1, 0.15, 0.2],
  // m/s, up to ~72 km/h
  speed: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12, 15, 20],
  // bpm
  heartRate: [40, 60, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200],
  // rpm / spm — one scale covers both, they are read per sport anyway
  cadence: [20, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200],
  // watts
  power: [50, 100, 150, 200, 250, 300, 350, 400, 500, 600, 800],
  // metres above sea level
  elevation: [0, 100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000],
  // °C
  temperature: [-10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40]
}

/**
 * What a stored summary may be keyed by: every field of the aggregate
 * vocabulary, plus the raw channels that are tracked for presence only.
 *
 * The two lists overlap on every field that is read straight off a sample, and
 * they are the same string there — a field named `heartRate` summarizes the
 * `heartRate` channel. The union exists for the two that do not line up:
 * `distance`, a channel that is no field, and `slope`, a field that is no
 * channel.
 */
export type SummaryKey = SampleField | SampleChannel

/** Keys a histogram can be read from. The others are tracked for presence only. */
export const KEYS_WITH_EDGES = [...new Set([...SAMPLE_FIELDS, ...SAMPLE_CHANNELS])].filter(
  key => CHANNEL_EDGES[key] != null
)

export function readChannel(sample: Sample, channel: SampleChannel): number | undefined {
  const value = sample[channel]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * A mergeable description of one channel over one activity.
 *
 * Mergeable is the requirement everything else follows from: the report the UI
 * shows spans a whole library, and recomputing it from raw samples on every
 * open would mean rereading every detail record. Summing counts and buckets
 * across activities is O(activities), and the per-activity part is already paid
 * by the index.
 */
export interface ChannelSummary {
  /** Samples carrying a usable value. */
  n: number
  min: number
  max: number
  sum: number
  /** One more entry than there are edges. */
  buckets: number[]
}

export function emptySummary(key: SummaryKey): ChannelSummary {
  const edges = CHANNEL_EDGES[key]
  return {
    n: 0,
    min: Infinity,
    max: -Infinity,
    sum: 0,
    // No edges means presence-only tracking, and an empty bucket list rather
    // than a single catch-all bucket: nothing should read a distribution off a
    // channel that was never bucketed.
    buckets: edges ? new Array(edges.length + 1).fill(0) : []
  }
}

function bucketIndex(edges: number[], value: number): number {
  let i = 0
  while (i < edges.length && value >= edges[i]) i++
  return i
}

/**
 * Summarize every channel of one activity.
 *
 * Returns only the channels that actually carried a value, so an absent channel
 * costs nothing to store and reads as absent rather than as a row of zeroes —
 * "no power meter" and "rode at zero watts" are not the same statement.
 *
 * Every channel, not only the ones with buckets: a distance trace has no
 * distribution worth plotting, but its presence is exactly what says whether
 * slope can be derived at all.
 */
export function summarizeSamples(samples: Sample[]): Record<string, ChannelSummary> {
  const out: Record<string, ChannelSummary> = {}
  const derived = deriveSeries(samples)

  const summarize = (key: SummaryKey, valueAt: (index: number) => number | undefined) => {
    const edges = CHANNEL_EDGES[key]
    let summary: ChannelSummary | null = null

    for (let i = 0; i < samples.length; i++) {
      const value = valueAt(i)
      if (value === undefined || !Number.isFinite(value)) continue

      if (!summary) summary = emptySummary(key)
      summary.n++
      summary.sum += value
      if (value < summary.min) summary.min = value
      if (value > summary.max) summary.max = value
      if (edges) summary.buckets[bucketIndex(edges, value)]++
    }

    if (summary) out[key] = summary
  }

  for (const channel of SAMPLE_CHANNELS) {
    summarize(channel, i => readChannel(samples[i], channel))
  }

  // Slope is never stored, and speed often is not — a trace with a distance
  // channel and no speed one is the common case. Summarizing what was derived
  // is what lets those fields report a distribution instead of only reporting
  // that they could be computed.
  summarize('slope', i => derived.slope[i])
  if (!out.speed) summarize('speed', i => derived.speed[i])

  return out
}

/** Fold `b` into `a` and return `a`. Both must describe the same channel. */
export function mergeSummary(a: ChannelSummary, b: ChannelSummary): ChannelSummary {
  a.n += b.n
  a.sum += b.sum
  if (b.min < a.min) a.min = b.min
  if (b.max > a.max) a.max = b.max
  for (let i = 0; i < a.buckets.length && i < b.buckets.length; i++) {
    a.buckets[i] += b.buckets[i]
  }
  return a
}

/**
 * Approximate a quantile from the histogram, interpolating inside the bucket
 * the rank falls in.
 *
 * Approximate on purpose. The exact value would need every sample kept, and
 * this is read to propose a band — "most of your climbing happens between 3%
 * and 8%" — where bucket-width precision is the honest precision anyway. The
 * open end buckets return the observed min/max rather than a made-up bound.
 */
export function quantile(summary: ChannelSummary, key: SummaryKey, p: number): number | undefined {
  const edges = CHANNEL_EDGES[key]
  if (!edges || summary.n === 0) return undefined

  const target = Math.min(Math.max(p, 0), 1) * summary.n
  let cumulative = 0

  for (let i = 0; i < summary.buckets.length; i++) {
    const count = summary.buckets[i]
    if (count === 0) continue

    if (cumulative + count >= target) {
      const low = i === 0 ? summary.min : edges[i - 1]
      const high = i === edges.length ? summary.max : edges[i]
      if (!Number.isFinite(low) || !Number.isFinite(high)) return summary.min
      const within = count === 0 ? 0 : (target - cumulative) / count
      return low + (high - low) * within
    }
    cumulative += count
  }

  return summary.max
}

export type FieldAvailability = 'measured' | 'computable' | 'absent'

/**
 * Whether a field can be used at all, given the channels a library holds.
 *
 * Three states rather than two, because the difference matters to whoever is
 * building a definition: a measured field comes with a distribution to pick a
 * band from, a computable one is offered but has no numbers behind it yet, and
 * an absent one must not be offered at all — a filter on a channel nobody
 * recorded matches nothing and looks like a bug.
 *
 * `computable` is the narrow case of a field the scan *could* have produced but
 * did not: an outing shorter than the slope window has elevation and distance
 * and still yields no slope, because there is no hundred metres to measure one
 * over. Offering it there is right — a longer outing will fill it in — and
 * offering a band for it is not.
 */
export function availabilityOf(
  field: SampleField,
  presentChannels: ReadonlySet<string>
): FieldAvailability {
  const spec = SAMPLE_FIELD_SPECS[field]

  // Keyed on the field itself: a summary exists under the field's own name
  // whether it was read off the sample or derived from the trace.
  if (presentChannels.has(field)) return 'measured'

  for (const requirement of spec.computableFrom ?? []) {
    if (requirement.every(channel => presentChannels.has(channel))) return 'computable'
  }

  return 'absent'
}
