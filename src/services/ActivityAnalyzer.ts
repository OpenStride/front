import { Sample } from '@/types/activity'

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

export class ActivityAnalyzer {
  constructor(private samples: Sample[]) {}

  /**
   * Split the track every `stepMeters`, cutting exactly on the mark.
   *
   * Cutting at the first sample past the threshold instead made every split a
   * different length — 1005, 1012, 990 m for a "1 km" split, and worse on a
   * watch that thins its samples. A reader cannot compare splits of unequal
   * length, and the table read like a list of raw measurements. Interpolating
   * the crossing point costs one sample per boundary and makes each split
   * exactly the distance it claims to be.
   */
  public sampleAverageByDistance(stepMeters: number): SegmentSample[] {
    const points = this.samples.filter(s => s.distance != null)
    if (points.length === 0 || stepMeters <= 0) return []

    const result: SegmentSample[] = []
    let currentSegment: Sample[] = []
    let previousEnd: Sample | undefined
    let nextThreshold = stepMeters

    for (let i = 0; i < points.length; i++) {
      const sample = points[i]

      // A single gap can span several marks when the watch records sparsely
      while (sample.distance! >= nextThreshold) {
        const boundary = this.interpolateAtDistance(points[i - 1] ?? sample, sample, nextThreshold)
        currentSegment.push(boundary)
        result.push(this.computeAverageSample(currentSegment, previousEnd))
        previousEnd = boundary
        currentSegment = [boundary]
        nextThreshold += stepMeters
      }

      currentSegment.push(sample)
    }

    // Whatever is left after the last mark — a real, shorter split. Nothing to
    // report when the track ended exactly on one: the segment is then just the
    // boundary sample repeated.
    const tail = currentSegment[currentSegment.length - 1]
    if (currentSegment.length > 1 && (tail.distance ?? 0) > (previousEnd?.distance ?? -1)) {
      result.push(this.computeAverageSample(currentSegment, previousEnd))
    }

    return result
  }

  /** Linear interpolation between two samples at an exact distance mark */
  private interpolateAtDistance(before: Sample, after: Sample, distance: number): Sample {
    const from = before.distance ?? distance
    const to = after.distance ?? distance
    const span = to - from
    const ratio = span > 0 ? (distance - from) / span : 0

    const mix = (a?: number, b?: number) => {
      if (a == null) return b
      if (b == null) return a
      return a + (b - a) * ratio
    }

    return {
      time: mix(before.time, after.time) ?? after.time,
      distance,
      lat: mix(before.lat, after.lat),
      lng: mix(before.lng, after.lng),
      elevation: mix(before.elevation, after.elevation),
      heartRate: mix(before.heartRate, after.heartRate),
      cadence: mix(before.cadence, after.cadence),
      speed: mix(before.speed, after.speed),
      power: mix(before.power, after.power)
    }
  }

  public sampleByLaps(laps: { time: number }[]): SegmentSample[] {
    if (!laps?.length || this.samples.length === 0) return []

    const result: SegmentSample[] = []
    let sampleIdx = 0
    let previousEnd: Sample | undefined

    for (const lap of laps) {
      const segment: Sample[] = []

      // empile tous les samples dont le temps est < lap.time
      while (sampleIdx < this.samples.length && this.samples[sampleIdx].time < lap.time) {
        segment.push(this.samples[sampleIdx])
        sampleIdx++
      }

      if (segment.length) {
        const avg = this.computeAverageSample(segment, previousEnd)

        // distance & time = valeur cumulée à la fin du lap
        const last = segment[segment.length - 1]
        avg.time = last.time
        avg.distance = last.distance
        previousEnd = last

        result.push(avg)
      }
    }

    /* S'il reste des samples après le dernier lap (ex. arrêt tardif) */
    if (sampleIdx < this.samples.length) {
      const leftover = this.computeAverageSample(this.samples.slice(sampleIdx), previousEnd)
      const last = this.samples[this.samples.length - 1]
      leftover.time = last.time
      leftover.distance = last.distance
      result.push(leftover)
    }

    return result
  }

  /**
   * Total climbed and descended, in metres.
   *
   * Barometric and GPS altitude jitter by a metre or two at rest, so summing
   * every delta inflates both figures — a flat run can "climb" a hundred metres
   * of noise. Only a run of movement that exceeds the threshold counts, which
   * is the usual way devices compute these.
   *
   * Use the provider's own figures when it supplies them; this is for the ones
   * that do not.
   */
  public elevationChange(): { ascent: number; descent: number } {
    // 3 m, not 2: a barometer resting at ±1 m produces 2 m swings, which a
    // threshold of 2 would count as real climb on a perfectly flat activity.
    const THRESHOLD_M = 3

    let ascent = 0
    let descent = 0
    let reference: number | null = null

    for (const sample of this.samples) {
      const elevation = sample.elevation
      if (elevation == null || !Number.isFinite(elevation)) continue
      if (reference === null) {
        reference = elevation
        continue
      }
      const diff = elevation - reference
      if (diff >= THRESHOLD_M) {
        ascent += diff
        reference = elevation
      } else if (diff <= -THRESHOLD_M) {
        descent += -diff
        reference = elevation
      }
    }

    return { ascent: Math.round(ascent), descent: Math.round(descent) }
  }

  /**
   * The shape of the course, read from the track itself — enough for a widget to
   * decide whether grade is worth showing at all.
   *
   * Built on `elevationChange()` so there is one noise-filtered accumulator, not
   * two that could drift apart.
   */
  public elevationProfile(): ElevationProfile {
    const { ascent, descent } = this.elevationChange()
    const hasElevation = this.samples.some(s => s.elevation != null && Number.isFinite(s.elevation))

    const first = this.samples.find(s => s.distance != null)?.distance ?? 0
    const last = [...this.samples].reverse().find(s => s.distance != null)?.distance ?? first
    const distance = Math.max(0, last - first)
    const gainPerKm = distance > 0 ? ascent / (distance / 1000) : 0

    return {
      gain: ascent,
      loss: descent,
      distance,
      gainPerKm,
      // No elevation at all is not a flat course, it is an unknown one — but
      // there is nothing to show either way, so treat it as flat
      isFlat: !hasElevation || gainPerKm < FLAT_GAIN_PER_KM,
      hasElevation
    }
  }

  private classifyByAccumulatedSlope(samples: Sample[]): 'up' | 'down' | 'flat' {
    let gain = 0
    let loss = 0
    const startDist = samples[0]?.distance ?? 0
    const endDist = samples.at(-1)?.distance ?? startDist
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1].elevation
      const curr = samples[i].elevation
      if (prev != null && curr != null) {
        const diff = curr - prev
        if (diff > 0) gain += diff
        else loss += Math.abs(diff)
      }
    }
    const dist = endDist - startDist || 1
    const slopeRatio = ((gain - loss) / dist) * 100
    if (slopeRatio > 1) return 'up'
    if (slopeRatio < -1) return 'down'
    return 'flat'
  }

  /**
   * Regroupe les samples par pente dominante (montée / descente / plat).
   * On coupe le segment dès qu'un changement durable de signe de pente est
   * constaté sur une fenêtre de 20 m, à condition que le segment courant
   * fasse déjà minDistanceMeters.
   */
  /**
   * Segmente la trace en montées, descentes (ou plats) robustes au bruit.
   * @param minDistanceMeters  Longueur minimale (m) qu'un tronçon doit avoir
   *                           avant qu'on puisse le couper.
   * @returns  Un Sample moyen par tronçon.
   */
  public sampleBySlopeChange(minDistanceMeters: number): SegmentSample[] {
    if (this.samples.length === 0) return []

    /* Réglages */
    const SMOOTH_WINDOW = 5
    const STABLE_DIST = 30
    const SLOPE_TOL = 0.02

    /* — 1) Lissage simple de l'altitude — */
    const elevSmooth = this.samples.map((_, i) => {
      let sum = 0,
        cnt = 0
      for (
        let j = Math.max(0, i - SMOOTH_WINDOW);
        j <= Math.min(this.samples.length - 1, i + SMOOTH_WINDOW);
        j++
      ) {
        const e = this.samples[j].elevation
        if (e != null) {
          sum += e
          cnt++
        }
      }
      return cnt ? sum / cnt : undefined
    })

    /* — 2) Helpers — */
    const signSlope = (dh: number, dd: number) => {
      if (dd === 0) return 0
      const s = dh / dd
      if (Math.abs(s) < SLOPE_TOL) return 0
      return s > 0 ? 1 : -1
    }

    const segSamples: SegmentSample[] = []

    /* — 3) Variables d'état — */
    let segStart = 0
    let segDir: number | null = null
    let candIdx = -1
    let candDir: number | null = null

    /* — 4) Balayage — */
    for (let i = 1; i < this.samples.length; i++) {
      const dPrev = this.samples[i - 1].distance
      const dCurr = this.samples[i].distance
      if (dPrev == null || dCurr == null) continue

      const dh = elevSmooth[i]! - elevSmooth[i - 1]!
      const dir = signSlope(dh, dCurr - dPrev)

      if (segDir === null) {
        segDir = dir
        continue
      }

      // même sens ⇒ reset candidat
      if (dir === segDir || dir === 0) {
        candIdx = -1
        candDir = null
        continue
      }

      // nouvelle direction
      if (candIdx === -1) {
        candIdx = i
        candDir = dir
        continue
      }

      // bruit ? → redéfinit candidat
      if (dir !== candDir) {
        candIdx = i
        candDir = dir
        continue
      }

      // direction stable depuis candIdx ?
      const stableDist = dCurr - (this.samples[candIdx].distance ?? dCurr)
      const segLen = dCurr - (this.samples[segStart].distance ?? dCurr)

      if (stableDist >= STABLE_DIST && segLen >= minDistanceMeters) {
        /* tronçon validé : [segStart, candIdx[ */
        segSamples.push(this.buildSegmentSample(segStart, candIdx))
        segStart = candIdx
        segDir = candDir
        candIdx = -1
        candDir = null
      }
    }

    /* — 5) Dernier tronçon — */
    if (segStart < this.samples.length) {
      segSamples.push(this.buildSegmentSample(segStart, this.samples.length))
    }

    return segSamples
  }

  /** Construit un Sample représentatif du segment [a, b[ (b exclu) */
  private buildSegmentSample(a: number, b: number): SegmentSample {
    const seg = this.samples.slice(a, b)
    if (seg.length === 0) {
      return { time: 0, distance: 0 }
    }
    const end = seg[seg.length - 1] // ← distance & time cumulés

    const avg = <T extends keyof Sample>(key: T) => {
      const vals = seg.map(s => s[key]).filter((v): v is number => v !== undefined)
      return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : undefined
    }

    // a > 0 means the previous segment ended on the sample just before this one
    const { slope, segmentDistance, segmentEnd } = this.segmentSlope(
      seg,
      a > 0 ? this.samples[a - 1] : undefined
    )

    return {
      time: end.time, // cumul exact
      distance: end.distance, // cumul exact
      lat: avg('lat'),
      lng: avg('lng'),
      elevation: avg('elevation'),
      heartRate: avg('heartRate'),
      cadence: avg('cadence'),
      speed: avg('speed'),
      slope,
      segmentDistance,
      segmentEnd
    }
  }

  /* utilitaire */
  private computeAverageSample(arr: Sample[], previousEnd?: Sample): SegmentSample {
    if (arr.length === 0) {
      return { time: 0, distance: 0 }
    }
    const avg = (sel: (s: Sample) => number | undefined) => {
      const v = arr.map(sel).filter((x): x is number => x !== undefined)
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
    }
    const { slope, segmentDistance, segmentEnd } = this.segmentSlope(arr, previousEnd)
    return {
      time: Math.round(avg(s => s.time) ?? 0),
      distance: avg(s => s.distance),
      lat: avg(s => s.lat),
      lng: avg(s => s.lng),
      elevation: avg(s => s.elevation),
      heartRate: avg(s => s.heartRate),
      cadence: avg(s => s.cadence),
      speed: avg(s => s.speed),
      slope,
      segmentDistance,
      segmentEnd
    }
  }

  /**
   * Rise over run across the whole segment, taken from the raw samples.
   *
   * The segment starts where the previous one ended, so consecutive segments
   * cover the track without leaving the gap between them unaccounted for.
   */
  private segmentSlope(
    arr: Sample[],
    previousEnd?: Sample
  ): { slope?: number; segmentDistance?: number; segmentEnd?: number } {
    const withElevation = arr.filter(s => s.elevation != null)
    const start = previousEnd ?? arr[0]
    const end = arr[arr.length - 1]

    const startDistance = start?.distance
    const endDistance = end?.distance
    const run =
      startDistance != null && endDistance != null ? endDistance - startDistance : undefined

    const startElevation = previousEnd?.elevation ?? withElevation[0]?.elevation
    const endElevation = withElevation[withElevation.length - 1]?.elevation

    if (run == null || run <= 0 || startElevation == null || endElevation == null) {
      return { slope: undefined, segmentDistance: run, segmentEnd: endDistance ?? undefined }
    }

    return {
      slope: ((endElevation - startElevation) / run) * 100,
      segmentDistance: run,
      segmentEnd: endDistance
    }
  }

  public bestSegments(
    targets: number[] = [
      1_000,
      2_000,
      5_000,
      10_000,
      15_000,
      20_000,
      21_097, // semi
      42_195 // marathon
    ]
  ): Record<number, { sample: Sample; duration: number; startIdx: number; endIdx: number } | null> {
    if (!this.samples.length) {
      return Object.fromEntries(targets.map(t => [t, null]))
    }

    /* Assure qu'on dispose de distance & temps cumulés */
    const valid = this.samples.every(s => s.distance != null && s.time != null)
    if (!valid) {
      throw new Error('Tous les samples doivent contenir une distance et un temps cumulés.')
    }

    /* --- Fonction utilitaire pour moyenne d'un segment --- */
    const buildAvgSample = (a: number, b: number): Sample => {
      const seg = this.samples.slice(a, b + 1) // b inclus
      const end = seg[seg.length - 1]
      const avg = <T extends keyof Sample>(k: T) => {
        const v = seg.map(s => s[k]).filter((x): x is number => x !== undefined)
        return v.length ? v.reduce((p, c) => p + c) / v.length : undefined
      }
      return {
        time: end.time,
        distance: end.distance,
        lat: avg('lat'),
        lng: avg('lng'),
        elevation: avg('elevation'),
        heartRate: avg('heartRate'),
        cadence: avg('cadence'),
        speed: avg('speed')
      }
    }

    /* --- Algorithme “deux pointeurs” pour chaque cible --- */
    const out: Record<
      number,
      { sample: Sample; duration: number; startIdx: number; endIdx: number } | null
    > = {}

    for (const target of targets) {
      let bestDur = Number.POSITIVE_INFINITY
      let best: { startIdx: number; endIdx: number } | null = null

      let end = 0
      for (let start = 0; start < this.samples.length; start++) {
        // Avance end jusqu'à couvrir la distance cible
        while (
          end < this.samples.length &&
          this.samples[end].distance! - this.samples[start].distance! < target
        ) {
          end++
        }
        if (end >= this.samples.length) break // plus assez de trace

        const dur = this.samples[end].time! - this.samples[start].time!
        if (dur > 0 && dur < bestDur) {
          bestDur = dur
          best = { startIdx: start, endIdx: end }
        }
      }

      out[target] = best
        ? {
            startIdx: best.startIdx,
            endIdx: best.endIdx,
            duration: bestDur,
            sample: buildAvgSample(best.startIdx, best.endIdx)
          }
        : null // la séance est plus courte que target
    }

    return out
  }
}
