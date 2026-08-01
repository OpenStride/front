import type { Sample } from '@/types/activity'
import FitFileParser from 'fit-file-parser'
import pako from 'pako'

// A Strava export bundles per-activity track files in mixed formats (.fit.gz,
// .gpx, .tcx.gz) depending on how each activity was recorded. This module parses
// any of them into one normalised shape so the adapter stays format-agnostic.

export interface ParsedLap {
  time: number // seconds from activity start
  duration: number // seconds
  distance: number // meters
}

export interface ParsedSummary {
  startTime?: number // epoch seconds
  duration?: number // seconds
  distance?: number // meters
  totalAscent?: number // meters
  averageHeartRate?: number
  maxHeartRate?: number
  averageSpeed?: number // m/s
  maxSpeed?: number // m/s
  averageCadence?: number
  averagePower?: number
  calories?: number
}

export interface ParsedTrack {
  samples: Sample[]
  laps: ParsedLap[]
  summary: ParsedSummary
}

type RawRecord = Record<string, unknown>

const num = (v: unknown): number | undefined => (typeof v === 'number' && !isNaN(v) ? v : undefined)

/** Haversine distance in meters between two lat/lng points. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Sum of positive elevation deltas across a sample series. */
function computeAscent(samples: Sample[]): number | undefined {
  let ascent = 0
  let prev: number | undefined
  let seen = false
  for (const s of samples) {
    if (typeof s.elevation === 'number') {
      if (prev !== undefined && s.elevation > prev) ascent += s.elevation - prev
      prev = s.elevation
      seen = true
    }
  }
  return seen ? Math.round(ascent) : undefined
}

// ============================================================================
// Dispatch
// ============================================================================

/**
 * Parse a Strava export track file (FIT/GPX/TCX, optionally gzipped) into a
 * normalised ParsedTrack. Returns null for unknown/unparseable formats.
 */
export async function parseTrackFile(
  fileName: string,
  data: Uint8Array
): Promise<ParsedTrack | null> {
  const lower = fileName.toLowerCase()
  let raw = data
  if (lower.endsWith('.gz')) {
    try {
      raw = pako.ungzip(data)
    } catch {
      return null
    }
  }
  const base = lower.replace(/\.gz$/, '')

  try {
    if (base.endsWith('.fit')) return await parseFit(raw)
    if (base.endsWith('.gpx')) return parseGpx(new TextDecoder().decode(raw))
    if (base.endsWith('.tcx')) return parseTcx(new TextDecoder().decode(raw))
  } catch {
    return null
  }
  return null
}

// ============================================================================
// FIT
// ============================================================================

interface FitResult {
  records?: RawRecord[]
  laps?: RawRecord[]
  sessions?: RawRecord[]
  session?: RawRecord
  activity?: RawRecord
}

function parseFit(raw: Uint8Array): Promise<ParsedTrack> {
  return new Promise((resolve, reject) => {
    const parser = new FitFileParser({
      force: true,
      speedUnit: 'm/s',
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true
    })
    parser.parse(raw.buffer as ArrayBuffer, (err, res) => {
      if (err) return reject(new Error(err))
      const result = (res ?? {}) as unknown as FitResult

      const records = result.records ?? []
      const start =
        num((records[0] as RawRecord)?.timestamp as number) ??
        toEpoch((records[0] as RawRecord)?.timestamp)

      const samples: Sample[] = records.map(r => ({
        time: Number(
          r.elapsed_time ??
            r.timer_time ??
            (r.timestamp ? (toEpoch(r.timestamp) ?? 0) - (start ?? 0) : 0)
        ),
        distance: num(r.distance as number),
        lat: num(r.position_lat as number),
        lng: num(r.position_long as number),
        elevation: num((r.enhanced_altitude ?? r.altitude) as number),
        heartRate: num(r.heart_rate as number),
        cadence: num(r.cadence as number),
        speed: num((r.enhanced_speed ?? r.speed) as number),
        power: num(r.power as number),
        temperature: num(r.temperature as number)
      }))

      const session = result.session ?? result.sessions?.[0] ?? result.activity ?? {}
      const laps: ParsedLap[] = (result.laps ?? []).map(l => ({
        time: Number(l.start_time ? (toEpoch(l.start_time) ?? 0) - (start ?? 0) : 0),
        duration: Number(l.total_timer_time ?? l.total_elapsed_time ?? 0),
        distance: Number(l.total_distance ?? 0)
      }))

      resolve({
        samples,
        laps,
        summary: {
          startTime: start,
          duration: num((session.total_timer_time ?? session.total_elapsed_time) as number),
          distance: num(session.total_distance as number),
          totalAscent: num(session.total_ascent as number) ?? computeAscent(samples),
          averageHeartRate: num(session.avg_heart_rate as number),
          maxHeartRate: num(session.max_heart_rate as number),
          averageSpeed: num((session.enhanced_avg_speed ?? session.avg_speed) as number),
          maxSpeed: num((session.enhanced_max_speed ?? session.max_speed) as number),
          averageCadence: num(session.avg_cadence as number),
          averagePower: num(session.avg_power as number),
          calories: num(session.total_calories as number)
        }
      })
    })
  })
}

function toEpoch(v: unknown): number | undefined {
  if (!v) return undefined
  if (typeof v === 'number') return v
  const t = Date.parse(String(v))
  return isNaN(t) ? undefined : Math.floor(t / 1000)
}

// ============================================================================
// GPX
// ============================================================================

function parseGpx(xml: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const pts = Array.from(doc.getElementsByTagName('trkpt'))
  const localName = (tag: string) => (el: Element) =>
    Array.from(el.children).find(c => c.localName === tag)

  let startEpoch: number | undefined
  let distAccum = 0
  let prevLat: number | undefined
  let prevLng: number | undefined

  const samples: Sample[] = pts.map(pt => {
    const lat = parseFloat(pt.getAttribute('lat') ?? '')
    const lng = parseFloat(pt.getAttribute('lon') ?? '')
    const eleEl = localName('ele')(pt)
    const timeEl = localName('time')(pt)
    const epoch = timeEl ? toEpoch(timeEl.textContent) : undefined
    if (startEpoch === undefined && epoch !== undefined) startEpoch = epoch

    if (!isNaN(lat) && !isNaN(lng)) {
      if (prevLat !== undefined && prevLng !== undefined)
        distAccum += haversine(prevLat, prevLng, lat, lng)
      prevLat = lat
      prevLng = lng
    }

    // Heart rate / cadence / power live under <extensions> (gpxtpx / ns3 namespaces)
    let hr: number | undefined
    let cad: number | undefined
    let pw: number | undefined
    const ext = localName('extensions')(pt)
    if (ext) {
      for (const el of ext.getElementsByTagName('*')) {
        const n = el.localName?.toLowerCase()
        const val = parseFloat(el.textContent ?? '')
        if (isNaN(val)) continue
        if (n === 'hr') hr = val
        else if (n === 'cad') cad = val
        else if (n === 'power' || n === 'powerinwatts') pw = val
      }
    }

    return {
      time: epoch !== undefined && startEpoch !== undefined ? epoch - startEpoch : 0,
      distance: Math.round(distAccum),
      lat: !isNaN(lat) ? lat : undefined,
      lng: !isNaN(lng) ? lng : undefined,
      elevation: eleEl ? num(parseFloat(eleEl.textContent ?? '')) : undefined,
      heartRate: hr,
      cadence: cad,
      power: pw
    }
  })

  const last = samples[samples.length - 1]
  return {
    samples,
    laps: [],
    summary: {
      startTime: startEpoch,
      duration: last?.time || undefined,
      distance: last?.distance || undefined,
      totalAscent: computeAscent(samples)
    }
  }
}

// ============================================================================
// TCX
// ============================================================================

function parseTcx(xml: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const child = (el: Element, tag: string) => Array.from(el.children).find(c => c.localName === tag)
  const childText = (el: Element, tag: string) => child(el, tag)?.textContent ?? undefined
  const deep = (el: Element, tag: string) => {
    const found = Array.from(el.getElementsByTagName('*')).find(e => e.localName === tag)
    return found?.textContent ?? undefined
  }

  const trackpoints = Array.from(doc.getElementsByTagName('*')).filter(
    e => e.localName === 'Trackpoint'
  )
  let startEpoch: number | undefined

  const samples: Sample[] = trackpoints.map(tp => {
    const epoch = toEpoch(childText(tp, 'Time'))
    if (startEpoch === undefined && epoch !== undefined) startEpoch = epoch
    const pos = child(tp, 'Position')
    return {
      time: epoch !== undefined && startEpoch !== undefined ? epoch - startEpoch : 0,
      distance: num(parseFloat(childText(tp, 'DistanceMeters') ?? '')),
      lat: pos ? num(parseFloat(childText(pos, 'LatitudeDegrees') ?? '')) : undefined,
      lng: pos ? num(parseFloat(childText(pos, 'LongitudeDegrees') ?? '')) : undefined,
      elevation: num(parseFloat(childText(tp, 'AltitudeMeters') ?? '')),
      heartRate: num(parseFloat(deep(tp, 'HeartRateBpm') ?? childText(tp, 'HeartRateBpm') ?? '')),
      cadence: num(parseFloat(childText(tp, 'Cadence') ?? '')),
      speed: num(parseFloat(deep(tp, 'Speed') ?? '')),
      power: num(parseFloat(deep(tp, 'Watts') ?? ''))
    }
  })

  const lapEls = Array.from(doc.getElementsByTagName('*')).filter(e => e.localName === 'Lap')
  let cursor = 0
  const laps: ParsedLap[] = lapEls.map(l => {
    const duration = num(parseFloat(childText(l, 'TotalTimeSeconds') ?? '')) ?? 0
    const distance = num(parseFloat(childText(l, 'DistanceMeters') ?? '')) ?? 0
    const lap = { time: cursor, duration, distance }
    cursor += duration
    return lap
  })

  const last = samples[samples.length - 1]
  const totalDistance = laps.reduce((a, l) => a + l.distance, 0)
  return {
    samples,
    laps,
    summary: {
      startTime: startEpoch,
      duration: laps.reduce((a, l) => a + l.duration, 0) || last?.time || undefined,
      distance: totalDistance || last?.distance || undefined,
      totalAscent: computeAscent(samples)
    }
  }
}
