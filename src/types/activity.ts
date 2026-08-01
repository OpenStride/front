import type { SportType } from './sport'

/**
 * Base interface for all stored records with sync metadata
 */
export interface Timestamped {
  id: string
  version: number // Incremented on each modification (conflict detection)
  lastModified: number // Timestamp in ms
  synced?: boolean // True if synced to remote storage
  deleted?: boolean // Soft delete flag
}

export interface Activity extends Timestamped {
  provider: string
  startTime: number
  duration: number
  distance: number
  // Canonical SportType (see src/types/sport.ts); `string` is kept for legacy /
  // not-yet-mapped values while preserving SportType autocomplete.
  type: SportType | (string & {})
  title?: string
  mapPolyline?: [number, number][] // tableau de [lat, lng] réduit
}

export interface Sample {
  time: number // temps depuis le début, en secondes
  distance?: number // distance depuis le début, en mètres (à compléter si possible)
  lat?: number // latitude en degrés
  lng?: number // longitude en degrés
  elevation?: number // en mètres
  heartRate?: number // en bpm
  cadence?: number // steps/min
  speed?: number
  power?: number // en watts
  temperature?: number // en °C
}

/**
 * A single sport-specific value, with the unit it is expressed in.
 *
 * The unit is always canonical/SI (`m`, `s`, `spm`…), never a display unit —
 * conversion happens at render time (see `useUnits`). Carrying it explicitly is
 * the point: `stats.averageCadence` alone cannot say whether 62 is steps,
 * revolutions or strokes per minute.
 */
export interface Measurement {
  value: number
  unit: string
}

export interface ActivityDetails extends Timestamped {
  samples?: Sample[]
  laps?: {
    time: number
    duration: number
    distance: number
  }[]
  /**
   * Sport-specific values, keyed by namespaced slug (`swim.swolf`,
   * `bike.cadence`…). Open by design: a provider or sport can contribute keys
   * without every other one having to know about them. See
   * `src/types/measurements.ts` for the keys core knows how to display.
   */
  measurements?: Record<string, Measurement>
  stats?: {
    averageHeartRate?: number
    maxHeartRate?: number
    averageSpeed?: number
    maxSpeed?: number
    averageCadence?: number
    totalAscent?: number
    /** Metres descended — the twin of totalAscent, and the figure a skier reads. */
    totalDescent?: number
    calories?: number
  }
  notes?: string
}

/**
 * What the list can narrow itself by.
 *
 * Every field here is readable straight off an `Activity`, which is what makes
 * the filters compatible with pagination. An elevation range used to sit in
 * this interface and was never applied: `Activity` carries no altitude, so
 * serving it would have meant reading every activity's details. Date and
 * duration replaced it — both are on the record, and both mean something in a
 * pool or a gym, where a distance range means nothing.
 */
export interface ActivityFilters {
  text?: string
  sportType?: string
  distanceMin?: number // in meters
  distanceMax?: number // in meters
  /** Local start of the first day, in ms */
  dateFrom?: number
  /** Local end of the last day, in ms — the range is inclusive */
  dateTo?: number
  durationMin?: number // in seconds
  durationMax?: number // in seconds
}
