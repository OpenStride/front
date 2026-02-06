import { Sample } from '@/types/activity'

export class ActivityAnalyzer {
  constructor(private samples: Sample[]) {}

  public sampleAverageByDistance(stepMeters: number): Sample[] {
    if (this.samples.length === 0) return []

    const result: Sample[] = []
    let currentSegment: Sample[] = []

    let nextThreshold = stepMeters
    for (const sample of this.samples) {
      if (sample.distance == null) continue

      currentSegment.push(sample)

      if (sample.distance >= nextThreshold) {
        result.push(this.computeAverageSample(currentSegment))
        currentSegment = []
        nextThreshold += stepMeters
      }
    }

    if (currentSegment.length > 0) {
      result.push(this.computeAverageSample(currentSegment))
    }

    return result
  }

  public sampleByLaps(laps: { time: number }[]): Sample[] {
    if (!laps?.length || this.samples.length === 0) return []

    const result: Sample[] = []
    let sampleIdx = 0

    for (const lap of laps) {
      const segment: Sample[] = []

      // empile tous les samples dont le temps est < lap.time
      while (sampleIdx < this.samples.length && this.samples[sampleIdx].time < lap.time) {
        segment.push(this.samples[sampleIdx])
        sampleIdx++
      }

      if (segment.length) {
        const avg = this.computeAverageSample(segment)

        // distance & time = valeur cumulée à la fin du lap
        const last = segment[segment.length - 1]
        avg.time = last.time
        avg.distance = last.distance

        result.push(avg)
      }
    }

    /* S’il reste des samples après le dernier lap (ex. arrêt tardif) */
    if (sampleIdx < this.samples.length) {
      const leftover = this.computeAverageSample(this.samples.slice(sampleIdx))
      const last = this.samples[this.samples.length - 1]
      leftover.time = last.time
      leftover.distance = last.distance
      result.push(leftover)
    }

    return result
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
   * On coupe le segment dès qu’un changement durable de signe de pente est
   * constaté sur une fenêtre de 20 m, à condition que le segment courant
   * fasse déjà minDistanceMeters.
   */
  /**
   * Segmente la trace en montées, descentes (ou plats) robustes au bruit.
   * @param minDistanceMeters  Longueur minimale (m) qu’un tronçon doit avoir
   *                           avant qu’on puisse le couper.
   * @returns  Un Sample moyen par tronçon.
   */
  public sampleBySlopeChange(minDistanceMeters: number): Sample[] {
    if (this.samples.length === 0) return []

    /* Réglages */
    const SMOOTH_WINDOW = 5
    const STABLE_DIST = 30
    const SLOPE_TOL = 0.02

    /* — 1) Lissage simple de l’altitude — */
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

    const segSamples: Sample[] = []

    /* — 3) Variables d’état — */
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
  private buildSegmentSample(a: number, b: number): Sample {
    const seg = this.samples.slice(a, b)
    const end = seg[seg.length - 1] // ← distance & time cumulés

    const avg = <T extends keyof Sample>(key: T) => {
      const vals = seg.map(s => s[key]).filter((v): v is number => v !== undefined)
      return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : undefined
    }

    return {
      time: end.time, // cumul exact
      distance: end.distance, // cumul exact
      lat: avg('lat'),
      lng: avg('lng'),
      elevation: avg('elevation'),
      heartRate: avg('heartRate'),
      cadence: avg('cadence'),
      speed: avg('speed')
    }
  }

  /* utilitaire */
  private computeAverageSample(arr: Sample[]): Sample {
    const avg = (sel: (s: Sample) => number | undefined) => {
      const v = arr.map(sel).filter((x): x is number => x !== undefined)
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
    }
    return {
      time: Math.round(avg(s => s.time) ?? 0),
      distance: avg(s => s.distance),
      lat: avg(s => s.lat),
      lng: avg(s => s.lng),
      elevation: avg(s => s.elevation),
      heartRate: avg(s => s.heartRate),
      cadence: avg(s => s.cadence),
      speed: avg(s => s.speed)
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

    /* Assure qu’on dispose de distance & temps cumulés */
    const valid = this.samples.every(s => s.distance != null && s.time != null)
    if (!valid) {
      throw new Error('Tous les samples doivent contenir une distance et un temps cumulés.')
    }

    /* --- Fonction utilitaire pour moyenne d’un segment --- */
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
        // Avance end jusqu’à couvrir la distance cible
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
