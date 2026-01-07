export interface Activity {
    id: string;
    provider: string;
    startTime: number;
    duration: number;
    distance: number;
    type: 'run' | 'bike' | 'swim' | 'walk' | 'hike' | string;
    title?: string;
    mapPolyline?: [number, number][]; // tableau de [lat, lng] réduit
}

export interface Sample {
    time: number;              // temps depuis le début, en secondes
    distance?: number;         // distance depuis le début, en mètres (à compléter si possible)
    lat?: number;              // latitude en degrés
    lng?: number;              // longitude en degrés
    elevation?: number;        // en mètres
    heartRate?: number;        // en bpm
    cadence?: number;          // steps/min
    speed?: number;
}

export interface ActivityDetails {
    id: string;
    samples?: Sample[];
    laps?: {
        time: number;
        duration: number;
        distance: number;
    }[];
    stats?: {
        averageHeartRate?: number;
        maxHeartRate?: number;
        averageSpeed?: number;
        maxSpeed?: number;
        averageCadence?: number;
        totalAscent?: number;
        calories?: number;
    };
    notes?: string;
}
