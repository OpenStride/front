import type { Sample } from './activity'

/**
 * An aggregated sample, plus what only the raw track can tell about the span it
 * stands for. Its `distance` and `elevation` are averages over the segment, so
 * they cannot be differenced to obtain a grade — doing that compares two segment
 * midpoints and reports roughly half the real slope, one segment late.
 */
export interface SegmentSample extends Sample {
  /** Grade over the segment in percent, undefined when elevation is missing */
  slope?: number
  /** Horizontal length of the segment in metres */
  segmentDistance?: number
  /**
   * Cumulative distance at the end of the segment.
   *
   * `distance` is an average for distance-based segments and an endpoint for
   * lap-based ones — a chart cannot know which. This is always the endpoint, so
   * bars can be drawn on the boundaries instead of between two midpoints.
   */
  segmentEnd?: number
}

/**
 * Below this many metres climbed per kilometre a course is flat enough that
 * grade tells the runner nothing. Sport type is deliberately not part of it:
 * watches mislabel trail as run and back, the terrain does not lie.
 */
export const FLAT_GAIN_PER_KM = 10

export interface ElevationProfile {
  /** Metres climbed, noise-filtered */
  gain: number
  /** Metres descended, noise-filtered */
  loss: number
  /** Horizontal distance covered, in metres */
  distance: number
  /** Metres climbed per kilometre — the shape of the course in one number */
  gainPerKm: number
  /** True when the course is flat enough that grade is not worth showing */
  isFlat: boolean
  /** False when the track carries no usable elevation at all */
  hasElevation: boolean
}
