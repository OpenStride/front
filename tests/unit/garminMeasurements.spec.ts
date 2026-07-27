import { describe, it, expect } from 'vitest'
import { adaptGarminDetails } from '@plugins/data-providers/GarminProvider/client/adapter'
import { MEASUREMENTS, isMeasurementKey } from '@/types/measurements'

const payload = (summary: Record<string, unknown>) => ({
  activityId: '42',
  summary: { startTimeInSeconds: 1000, ...summary },
  samples: []
})

describe('Garmin adapter — measurements', () => {
  it('keeps run, bike and swim cadence apart', () => {
    // The bug this fixes: all three used to collapse into stats.averageCadence,
    // after which nothing downstream could tell steps from strokes.
    const details = adaptGarminDetails(
      payload({
        averageRunCadenceInStepsPerMinute: 172,
        averageBikingCadenceInRevPerMinute: 88,
        averageSwimCadenceInStrokesPerMinute: 34
      })
    )

    expect(details.measurements?.['run.cadence']).toEqual({ value: 172, unit: 'spm' })
    expect(details.measurements?.['bike.cadence']).toEqual({ value: 88, unit: 'rpm' })
    expect(details.measurements?.['swim.strokeRate']).toEqual({ value: 34, unit: 'spm' })
  })

  it('reads the swim fields that used to be dropped', () => {
    const details = adaptGarminDetails(
      payload({
        poolLength: 25,
        numberOfActiveLengths: 60,
        totalNumberOfStrokes: 720,
        averageSwolf: 38
      })
    )

    expect(details.measurements?.['swim.poolLength']).toEqual({ value: 25, unit: 'm' })
    expect(details.measurements?.['swim.lengths']).toEqual({ value: 60, unit: 'count' })
    expect(details.measurements?.['swim.strokes']).toEqual({ value: 720, unit: 'count' })
    expect(details.measurements?.['swim.swolf']).toEqual({ value: 38, unit: 'swolf' })
  })

  it('emits only the keys the payload actually carries', () => {
    const details = adaptGarminDetails(payload({ averageRunCadenceInStepsPerMinute: 168 }))
    expect(Object.keys(details.measurements ?? {})).toEqual(['run.cadence'])
  })

  it('omits measurements entirely rather than storing an empty object', () => {
    const details = adaptGarminDetails(payload({}))
    expect(details.measurements).toBeUndefined()
  })

  it('ignores non-numeric values instead of storing NaN', () => {
    const details = adaptGarminDetails(
      payload({ poolLength: null, averageSwolf: 'n/a', numberOfActiveLengths: 40 })
    )
    expect(details.measurements?.['swim.poolLength']).toBeUndefined()
    expect(details.measurements?.['swim.swolf']).toBeUndefined()
    expect(details.measurements?.['swim.lengths']?.value).toBe(40)
  })

  it('still fills the legacy stats block for existing widgets', () => {
    const details = adaptGarminDetails(
      payload({ averageRunCadenceInStepsPerMinute: 172, averageHeartRateInBeatsPerMinute: 150 })
    )
    expect(details.stats?.averageCadence).toBe(172)
    expect(details.stats?.averageHeartRate).toBe(150)
  })

  it('only produces keys the core registry knows how to display', () => {
    const details = adaptGarminDetails(
      payload({
        averageRunCadenceInStepsPerMinute: 172,
        averageBikingCadenceInRevPerMinute: 88,
        averageSwimCadenceInStrokesPerMinute: 34,
        poolLength: 25,
        numberOfActiveLengths: 60,
        totalNumberOfStrokes: 720,
        averageSwolf: 38
      })
    )

    for (const [key, measurement] of Object.entries(details.measurements ?? {})) {
      expect(isMeasurementKey(key), `"${key}" is not in the registry`).toBe(true)
      // The stored unit must match what the registry says it is, or conversion
      // downstream would silently mean something else.
      expect(MEASUREMENTS[key as keyof typeof MEASUREMENTS].unit, `wrong unit for "${key}"`).toBe(
        measurement.unit
      )
    }
  })
})
