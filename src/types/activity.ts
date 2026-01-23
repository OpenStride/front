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
  type: 'run' | 'bike' | 'swim' | 'walk' | 'hike' | string
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
}

export interface ActivityDetails extends Timestamped {
  samples?: Sample[]
  laps?: {
    time: number
    duration: number
    distance: number
  }[]
  stats?: {
    averageHeartRate?: number
    maxHeartRate?: number
    averageSpeed?: number
    maxSpeed?: number
    averageCadence?: number
    totalAscent?: number
    calories?: number
  }
  notes?: string
}
