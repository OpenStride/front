import type { Sample } from '@/types/activity'

/**
 * Distance a slope is measured over, in metres.
 *
 * Differencing two consecutive samples would report the noise of the barometer
 * rather than the terrain: a one-second gap covers three metres, over which a
 * 30 cm elevation wobble reads as a 10% ramp. A fixed window in *distance* —
 * not in samples — keeps the figure comparable between a watch recording every
 * second and one recording every ten.
 *
 * Fixed and versioned rather than tunable: two versions of this constant
 * produce two different histories for the same aggregate, which is why
 * `AGGREGATE_ALGO_VERSION` has to move when it does.
 */
export const SLOPE_WINDOW_METERS = 100

/**
 * Longest gap between two samples that still counts as time spent moving.
 *
 * A paused activity resumes with a single sample carrying an hour of elapsed
 * time. Weighting an average by that raw gap lets one sample outvote the whole
 * outing, so the gap is capped: smart-recording intervals of ten or twenty
 * seconds pass through untouched, a pause contributes its cap and no more.
 */
export const MAX_SAMPLE_GAP_S = 30

/**
 * Per-sample values that are not stored, computed once for the whole trace.
 *
 * Arrays parallel to `samples`, `undefined` where the trace cannot answer —
 * the first hundred metres have no slope because there is nothing behind them
 * to measure against, and saying so beats inventing a zero.
 */
export interface DerivedSeries {
  /** Rise over run as a ratio: 0.05 is a 5% ramp. */
  slope: Array<number | undefined>
  /** Metres per second, from the speed channel or recovered from the trace. */
  speed: Array<number | undefined>
  /** Seconds attributable to each sample, capped. */
  dt: number[]
  /** Metres attributable to each sample. */
  dd: number[]
}

function finite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Derive slope, speed and per-sample weights in one pass.
 *
 * The slope window walks with a trailing pointer, so the whole thing stays
 * O(n) rather than rescanning backwards from every sample.
 *
 * A ratio, deliberately, where `ActivityAnalyzer.segmentSlope` returns percent:
 * that one feeds a chart label, this one feeds stored filter bounds, and bounds
 * follow the same rule as every other stored figure — SI in, display out. A
 * definition written against percent and read as a ratio would silently filter
 * for a hundredth of the intended band.
 */
export function deriveSeries(samples: Sample[]): DerivedSeries {
  const n = samples.length
  const slope: Array<number | undefined> = new Array(n).fill(undefined)
  const speed: Array<number | undefined> = new Array(n).fill(undefined)
  const dt: number[] = new Array(n).fill(0)
  const dd: number[] = new Array(n).fill(0)

  let windowStart = 0

  for (let i = 0; i < n; i++) {
    const sample = samples[i]
    const previous = i > 0 ? samples[i - 1] : undefined

    if (previous) {
      const elapsed = finite(sample.time) && finite(previous.time) ? sample.time - previous.time : 0
      dt[i] = elapsed > 0 ? Math.min(elapsed, MAX_SAMPLE_GAP_S) : 0

      const covered =
        finite(sample.distance) && finite(previous.distance)
          ? sample.distance - previous.distance
          : 0
      dd[i] = covered > 0 ? covered : 0
    }

    speed[i] = finite(sample.speed)
      ? sample.speed
      : dt[i] > 0 && dd[i] > 0
        ? dd[i] / dt[i]
        : undefined

    if (!finite(sample.distance) || !finite(sample.elevation)) continue

    // Advance the trailing edge as far as it can go while still spanning the
    // window, so the measurement uses the shortest run that qualifies.
    while (windowStart < i) {
      const candidate = samples[windowStart + 1]
      if (
        !finite(candidate?.distance) ||
        sample.distance - candidate.distance < SLOPE_WINDOW_METERS
      ) {
        break
      }
      windowStart++
    }

    const start = samples[windowStart]
    if (!finite(start?.distance) || !finite(start?.elevation)) continue

    const run = sample.distance - start.distance
    if (run >= SLOPE_WINDOW_METERS) {
      slope[i] = (sample.elevation - start.elevation) / run
    }
  }

  return { slope, speed, dt, dd }
}
