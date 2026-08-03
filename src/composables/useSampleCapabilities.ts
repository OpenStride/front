import { ref } from 'vue'
import { getPluginContext } from '@/services/PluginContextFactory'
import type { ActivityMetricsRow } from './useActivityMetricsIndex'
import type { Dimension } from '@/types/units'
import {
  SAMPLE_FIELDS,
  SAMPLE_FIELD_SPECS,
  availabilityOf,
  emptySummary,
  mergeSummary,
  quantile,
  type ChannelSummary,
  type FieldAvailability,
  type SampleChannel,
  type SampleField
} from '@/types/sampleFields'

const STORE = 'activity_metrics'

/**
 * What one field is worth in a given library.
 *
 * The numbers are what turn a field picker into a help: "heart rate, 82% of
 * your outings, mostly 120-165 bpm" tells someone building an aggregate both
 * that the field is usable and where to put the band. A bare list of field
 * names tells them neither, and invites a filter that matches nothing.
 */
export interface FieldCapability {
  field: SampleField
  labelKey: string
  dimension?: Dimension
  availability: FieldAvailability
  /** Activities whose samples carried the underlying channel. */
  activityCount: number
  /** Share of the activities in scope, 0..1. */
  activityRatio: number
  sampleCount: number
  /** SI, and absent unless the field was actually measured. */
  min?: number
  max?: number
  mean?: number
  p05?: number
  p50?: number
  p95?: number
}

export interface CapabilityReport {
  /** Lowercased sport the report was scoped to, or undefined for all. */
  sport?: string
  /** Activities in scope, indexed ones only. */
  activityCount: number
  fields: FieldCapability[]
  /** Every sport present in the index, lowercased and sorted. */
  sports: string[]
}

function summaryOf(
  rows: ActivityMetricsRow[],
  channel: SampleChannel
): { summary: ChannelSummary; activityCount: number } {
  const summary = emptySummary(channel)
  let activityCount = 0

  for (const row of rows) {
    const own = row.channels?.[channel]
    if (!own || own.n === 0) continue
    mergeSummary(summary, own)
    activityCount++
  }

  return { summary, activityCount }
}

/**
 * Describe what the indexed activities actually contain.
 *
 * Pure, and reading only the per-activity summaries the index already stores:
 * the alternative is rereading every detail record, which is the one thing the
 * index exists to avoid. Merging is a sum over rows, so scoping to a sport
 * costs a filter rather than a rescan.
 */
export function buildCapabilityReport(
  rows: ActivityMetricsRow[],
  sport?: string
): CapabilityReport {
  const scope = sport ? rows.filter(row => row.sport === sport.toLowerCase()) : rows

  const presentChannels = new Set<string>()
  for (const row of scope) {
    for (const [channel, summary] of Object.entries(row.channels ?? {})) {
      if (summary.n > 0) presentChannels.add(channel)
    }
  }

  const fields: FieldCapability[] = SAMPLE_FIELDS.map(field => {
    const spec = SAMPLE_FIELD_SPECS[field]
    const availability = availabilityOf(field, presentChannels)

    const base: FieldCapability = {
      field,
      labelKey: spec.labelKey,
      dimension: spec.dimension,
      availability,
      activityCount: 0,
      activityRatio: 0,
      sampleCount: 0
    }

    // A computable field has no histogram of its own — nothing scanned it. It
    // is still offered, without a suggested band, rather than silently dropped.
    if (availability !== 'measured' || !spec.channel) return base

    const { summary, activityCount } = summaryOf(scope, spec.channel)
    if (summary.n === 0) return base

    return {
      ...base,
      activityCount,
      activityRatio: scope.length > 0 ? activityCount / scope.length : 0,
      sampleCount: summary.n,
      min: summary.min,
      max: summary.max,
      mean: summary.sum / summary.n,
      p05: quantile(summary, spec.channel, 0.05),
      p50: quantile(summary, spec.channel, 0.5),
      p95: quantile(summary, spec.channel, 0.95)
    }
  })

  // Measured first, richest coverage first inside that — the order someone
  // scanning the list would want, rather than the order the union is declared.
  const rank: Record<FieldAvailability, number> = { measured: 0, computable: 1, absent: 2 }
  fields.sort((a, b) => {
    if (rank[a.availability] !== rank[b.availability]) {
      return rank[a.availability] - rank[b.availability]
    }
    return b.activityRatio - a.activityRatio
  })

  const sports = [...new Set(rows.map(row => row.sport).filter(Boolean))].sort()

  return { sport: sport?.toLowerCase(), activityCount: scope.length, fields, sports }
}

const report = ref<CapabilityReport | null>(null)
const loading = ref(false)

/**
 * Expose what the library can actually be asked about.
 *
 * Reads the index rather than the details, so it costs one store read and no
 * sample scan. A library that has never been indexed reports nothing available,
 * which is correct: nothing has been looked at yet.
 */
export function useSampleCapabilities() {
  async function loadCapabilities(sport?: string): Promise<CapabilityReport> {
    loading.value = true
    try {
      const ctx = await getPluginContext()
      const rows = ((await ctx.storage.exportDB(STORE)) ?? []) as ActivityMetricsRow[]
      const built = buildCapabilityReport(rows, sport)
      report.value = built
      return built
    } finally {
      loading.value = false
    }
  }

  return { report, loading, loadCapabilities }
}
