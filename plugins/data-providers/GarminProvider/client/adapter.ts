import { Activity, ActivityDetails } from '@/types/activity'

// Résumé d’activité Garmin → Activity OpenStride
export function adaptGarminSummary(garminDetails: any): Activity {
    const garmin = garminDetails.summary || garminDetails;

    const samples = garminDetails.samples ?? [];
    const polyline: [number, number][] = [];
    const step = Math.max(1, Math.floor(samples.length / 50)); // max 50 points
    for (let i = 0; i < samples.length; i += step) {
        const s = samples[i];
        if (s.latitudeInDegree && s.longitudeInDegree) {
            polyline.push([s.latitudeInDegree, s.longitudeInDegree]);
        }
    }
    return {
        id: `garmin_${garmin.activityId}`,
        provider: 'garmin',
        startTime: garmin.startTimeInSeconds,
        duration: garmin.durationInSeconds,
        distance: garmin.distanceInMeters,
        type: garmin.activityType?.toLowerCase() || 'unknown',
        title: garmin.activityName,
        mapPolyline: polyline,
        version: 1,
        lastModified: Date.now()
    }
}

// Détail Garmin → ActivityDetails OpenStride
export function adaptGarminDetails(garmin: any): ActivityDetails {
    const start = garmin.summary?.startTimeInSeconds ?? 0
    // const metrics = garmin.activityDetailMetrics?.metrics ?? []
    const samples = garmin.samples?.map((m: any) => ({
        time: m.startTimeInSeconds - start,
        distance: m.totalDistanceInMeters,       // important pour les analyses par km/mètres
        lat: m.latitudeInDegree,
        lng: m.longitudeInDegree,
        elevation: m.elevationInMeters,
        heartRate: m.heartRate,
        cadence: m.stepsPerMinute,
        speed: m.speedMetersPerSecond
    }));

    const laps = garmin.laps?.map((lap: any) => ({
        time: lap.startTimeInSeconds - start,
    }))

    return {
        id: `garmin_${garmin.activityId}`,
        samples,
        laps,
        stats: {
            averageHeartRate: garmin.summary?.averageHeartRateInBeatsPerMinute,
            maxHeartRate: garmin.summary?.maxHeartRateInBeatsPerMinute,
            averageSpeed: garmin.summary?.averageSpeedInMetersPerSecond,
            maxSpeed: garmin.summary?.maxSpeedInMetersPerSecond,
            averageCadence: garmin.summary?.averageRunCadenceInStepsPerMinute,
            totalAscent: garmin.summary?.totalElevationGainInMeters,
            calories: garmin.summary?.activeKilocalories
        },
        version: 1,
        lastModified: Date.now()
    }
}
