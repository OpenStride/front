import type { CapabilityReport } from '@/composables/useSampleCapabilities'
import type { CustomAggregateInput } from '@/services/CustomAggregateService'
import type { SampleField } from '@/types/sampleFields'

/**
 * A ready-made aggregate, offered as one click instead of a form.
 *
 * The form asks eight questions before it produces anything, which is a lot to
 * answer before knowing what the answers are worth. These are the aggregates
 * worth having on a first visit: the reader picks one, sees a figure, and only
 * then has a reason to build their own.
 *
 * Everything here is SI. A slope is a ratio, a speed is metres per second —
 * the form converts at its boundary, and these never pass through it.
 */
export interface AggregatePreset {
  id: string
  labelKey: string
  icon: string
  /**
   * Fields that must be *measured* for the suggestion to be offered.
   *
   * Not "declared" — measured. Suggesting a power aggregate to someone whose
   * bike has no meter builds a filter that matches nothing and reads as a bug.
   */
  requires: SampleField[]
  /** Built from the report, so a threshold can follow the reader's own data. */
  build(report: CapabilityReport): Omit<CustomAggregateInput, 'label'>
}

/** Rounded to something a human would have typed, in SI. */
function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function measured(report: CapabilityReport, field: SampleField) {
  const capability = report.fields.find(f => f.field === field)
  return capability?.availability === 'measured' ? capability : undefined
}

export const AGGREGATE_PRESETS: AggregatePreset[] = [
  {
    id: 'climb-heart-rate',
    labelKey: 'customAggregates.presets.climbHeartRate',
    icon: 'fas fa-heart-pulse',
    requires: ['slope', 'heartRate'],
    build: () => ({
      enabled: true,
      pinned: true,
      // From 3%: below that a slope costs little enough that the effort reads
      // as flat, and the band would swallow most of the outing.
      where: [{ field: 'slope', min: 0.03 }],
      measure: { field: 'heartRate', op: 'avg' },
      weightBy: 'time',
      periodOp: 'avg',
      minWeight: 120
    })
  },
  {
    id: 'flat-speed',
    labelKey: 'customAggregates.presets.flatSpeed',
    icon: 'fas fa-arrows-left-right',
    requires: ['slope', 'speed'],
    build: () => ({
      enabled: true,
      pinned: true,
      where: [{ field: 'slope', min: -0.01, max: 0.01 }],
      measure: { field: 'speed', op: 'avg' },
      weightBy: 'time',
      periodOp: 'avg',
      dimension: 'speed',
      minWeight: 300
    })
  },
  {
    id: 'climb-speed',
    labelKey: 'customAggregates.presets.climbSpeed',
    icon: 'fas fa-mountain',
    requires: ['slope', 'speed'],
    build: () => ({
      enabled: true,
      where: [{ field: 'slope', min: 0.02, max: 0.1 }],
      measure: { field: 'speed', op: 'avg' },
      weightBy: 'time',
      periodOp: 'avg',
      dimension: 'speed',
      minWeight: 120
    })
  },
  {
    id: 'descent-speed',
    labelKey: 'customAggregates.presets.descentSpeed',
    icon: 'fas fa-arrow-trend-down',
    requires: ['slope', 'speed'],
    build: () => ({
      enabled: true,
      where: [{ field: 'slope', max: -0.02 }],
      measure: { field: 'speed', op: 'avg' },
      weightBy: 'time',
      periodOp: 'avg',
      dimension: 'speed',
      minWeight: 120
    })
  },
  {
    id: 'climb-power',
    labelKey: 'customAggregates.presets.climbPower',
    icon: 'fas fa-bolt',
    requires: ['slope', 'power'],
    build: () => ({
      enabled: true,
      where: [{ field: 'slope', min: 0.03 }],
      measure: { field: 'power', op: 'avg' },
      weightBy: 'time',
      periodOp: 'avg',
      minWeight: 120
    })
  },
  {
    id: 'hard-effort-speed',
    labelKey: 'customAggregates.presets.hardEffortSpeed',
    icon: 'fas fa-fire',
    requires: ['heartRate', 'speed'],
    /**
     * The one threshold that cannot be a constant: "hard" is a different heart
     * rate for every reader. Taken from their own distribution — the top decile
     * of everything they have recorded — rather than from a formula on an age
     * the app does not know.
     */
    build: report => {
      const heartRate = measured(report, 'heartRate')
      const threshold = heartRate?.p95 !== undefined ? roundTo(heartRate.p95, 5) : 160

      return {
        enabled: true,
        where: [{ field: 'heartRate', min: threshold }],
        measure: { field: 'speed', op: 'avg' },
        weightBy: 'time',
        periodOp: 'avg',
        dimension: 'speed',
        minWeight: 120
      }
    }
  }
]

/**
 * The suggestions worth showing: supported by the data, and not already taken.
 *
 * A suggestion the reader has already accepted stops being a suggestion —
 * offering it again would create a duplicate that computes exactly the same
 * thing under a second name.
 */
export function availablePresets(
  report: CapabilityReport | null,
  existingPresetIds: ReadonlySet<string>
): AggregatePreset[] {
  if (!report) return []

  return AGGREGATE_PRESETS.filter(preset => {
    if (existingPresetIds.has(preset.id)) return false
    return preset.requires.every(field => measured(report, field) !== undefined)
  })
}
