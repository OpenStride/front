import { Activity, ActivityDetails } from '@/types/activity'

// Conversion date en timestamp integer
function toTimestamp(date: any): number {
  if (!date) return 0;
  if (typeof date === 'number') return date;
  if (typeof date === 'string') {
    const d = Date.parse(date);
    if (!isNaN(d)) return Math.floor(d / 1000);
    const d2 = new Date(date);
    if (!isNaN(d2.getTime())) return Math.floor(d2.getTime() / 1000);
  }
  return 0;
}

// Résumé d’activité ZIP → Activity OpenStride
export function adaptZipSummary(zipDetails: any): Activity {
  // Conversion date en timestamp integer
  function toTimestamp(date: any): number {
    if (!date) return 0;
    if (typeof date === 'number') return date;
    if (typeof date === 'string') {
      const d = Date.parse(date);
      if (!isNaN(d)) return Math.floor(d / 1000);
      const d2 = new Date(date);
      if (!isNaN(d2.getTime())) return Math.floor(d2.getTime() / 1000);
    }
    return 0;
  }
  // Adapter selon la structure du CSV et des FIT extraits
  // Exemples de champs à adapter (à ajuster selon ton format réel)
  const samples = zipDetails.records ?? zipDetails.samples ?? [];
  const polyline: [number, number][] = [];
  const step = Math.max(1, Math.floor(samples.length / 50)); // max 50 points
  for (let i = 0; i < samples.length; i += step) {
    const s = samples[i];
    // FIT: start_position_lat/long ou position_lat/long, CSV: rien
    if (s.start_position_lat && s.start_position_long) {
      polyline.push([s.start_position_lat, s.start_position_long]);
    } else if (s.position_lat && s.position_long) {
      polyline.push([s.position_lat, s.position_long]);
    }
  }
  const startRaw = zipDetails['Activity Date'] || zipDetails.activity?.timestamp || zipDetails.sessions?.[0]?.start_time;
  return {
    id: `zip_${zipDetails['Activity ID']}`,
    provider: 'zip',
    startTime: toTimestamp(startRaw),
    duration: Number(zipDetails['Elapsed Time_1'] || zipDetails['Elapsed Time'] || zipDetails.activity?.total_timer_time || zipDetails.sessions?.[0]?.total_timer_time),
    distance: Number(zipDetails['Distance_1'] || zipDetails['Distance'] || zipDetails.activity?.total_distance || zipDetails.sessions?.[0]?.total_distance),
    type: (zipDetails['Activity Type'] || zipDetails.activity?.type || zipDetails.sessions?.[0]?.sport || 'unknown').toLowerCase(),
    title: zipDetails['Activity Name'] || zipDetails.activity?.name || zipDetails.sessions?.[0]?.sport || '',
    mapPolyline: polyline,
    version: 1,
    lastModified: Date.now()
  }
}

// Détail ZIP → ActivityDetails OpenStride
export function adaptZipDetails(zip: any): ActivityDetails {
  // Start time: CSV date, FIT session start_time
  const start = toTimestamp(zip['Activity Date'] || zip.sessions?.[0]?.start_time || zip.activity?.timestamp || 0);
  // Samples: records (FIT), ou samples (FIT)
  const samples = (zip.records ?? zip.samples ?? []).map((m: any) => ({
    time: m.elapsed_time ?? m.timer_time ?? (m.timestamp ? toTimestamp(m.timestamp) - start : 0),
    distance: Number(m.distance ?? 0),
    lat: m.position_lat ?? m.start_position_lat ?? null,
    lng: m.position_long ?? m.start_position_long ?? null,
    elevation: m.elevation ?? m.enhanced_altitude ?? null,
    heartRate: m.heart_rate ?? null,
    cadence: m.cadence ?? null,
    speed: m.enhanced_speed ?? null,
    timestamp: m.timestamp ? toTimestamp(m.timestamp) : null
  }));

  // Laps: FIT laps
  const laps = (zip.laps ?? []).map((lap: any) => ({
    time: lap.total_timer_time ?? lap.total_elapsed_time ?? (lap.start_time ? toTimestamp(lap.start_time) - start : 0),
    startTime: lap.start_time ? toTimestamp(lap.start_time) : null,
    endTime: lap.end_time ? toTimestamp(lap.end_time) : null,
    distance: lap.total_distance ?? 0,
    avgHeartRate: lap.avg_heart_rate ?? null,
    maxHeartRate: lap.max_heart_rate ?? null,
    avgCadence: lap.avg_cadence ?? null,
    maxCadence: lap.max_cadence ?? null
  }));

  return {
    id: `zip_${zip['Activity ID']}`,
    samples,
    laps,
    stats: {
      averageHeartRate: Number(zip['Average Heart Rate'] ?? zip.sessions?.[0]?.avg_heart_rate ?? null),
      maxHeartRate: Number(zip['Max Heart Rate'] ?? zip.sessions?.[0]?.max_heart_rate ?? null),
      averageSpeed: Number(zip['Average Speed'] ?? zip.sessions?.[0]?.enhanced_avg_speed ?? null),
      maxSpeed: Number(zip['Max Speed'] ?? zip.sessions?.[0]?.enhanced_max_speed ?? null),
      averageCadence: Number(zip['Average Cadence'] ?? zip.sessions?.[0]?.avg_cadence ?? null),
      totalAscent: Number(zip['Elevation Gain'] ?? zip.sessions?.[0]?.total_ascent ?? null),
      calories: Number(zip['Calories'] ?? zip.sessions?.[0]?.total_calories ?? null)
    },
    version: 1,
    lastModified: Date.now()
  }
}
