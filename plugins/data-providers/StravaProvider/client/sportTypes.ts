import type { SportType } from '@/types/sport'

// Strava sport_type (PascalCase) → OpenStride SportType.
// Ported from Strava's SportType reference; slugs match the Garmin provider's so
// icons/labels/filters are shared (compiler-checked). Unknown → 'other'.
// Source: https://developers.strava.com/docs/reference/#api-models-SportType
const STRAVA_SPORT_MAP: Record<string, SportType> = {
  // Running
  Run: 'running',
  TrailRun: 'trail_running',
  VirtualRun: 'running',
  // Cycling
  Ride: 'cycling',
  MountainBikeRide: 'mountain_biking',
  GravelRide: 'cycling',
  EBikeRide: 'e_biking',
  EMountainBikeRide: 'e_biking',
  VirtualRide: 'indoor_cycling',
  Velomobile: 'cycling',
  Handcycle: 'cycling',
  // Swimming
  Swim: 'swimming',
  // Walking & hiking
  Walk: 'walking',
  Hike: 'hiking',
  // Winter sports
  AlpineSki: 'alpine_skiing',
  BackcountrySki: 'backcountry_skiing',
  NordicSki: 'cross_country_skiing',
  RollerSki: 'cross_country_skiing',
  Snowboard: 'snowboarding',
  Snowshoe: 'snowshoeing',
  IceSkate: 'ice_skating',
  // Water sports
  Rowing: 'rowing',
  VirtualRow: 'rowing_machine',
  Kayaking: 'kayaking',
  Canoeing: 'canoeing',
  StandUpPaddling: 'stand_up_paddleboarding',
  Surfing: 'surfing',
  Kitesurf: 'kitesurfing',
  Windsurf: 'windsurfing',
  Sail: 'sailing',
  // Gym & fitness
  WeightTraining: 'strength_training',
  Yoga: 'yoga',
  Pilates: 'pilates',
  Crossfit: 'cardio_training',
  Elliptical: 'elliptical',
  StairStepper: 'stair_climbing',
  HighIntensityIntervalTraining: 'cardio_training',
  Workout: 'other',
  // Racket sports
  Pickleball: 'pickleball',
  Racquetball: 'racquetball',
  Squash: 'squash',
  Badminton: 'badminton',
  TableTennis: 'table_tennis',
  Tennis: 'tennis',
  // Team sports
  Soccer: 'soccer',
  // Outdoor & other
  RockClimbing: 'rock_climbing',
  Golf: 'golf',
  Skateboard: 'skateboarding',
  InlineSkate: 'inline_skating',
  Wheelchair: 'wheelchair'
}

/** Map a Strava sport_type (or legacy type) to an OpenStride SportType. */
export function mapStravaSport(sportType: unknown): SportType {
  if (typeof sportType !== 'string' || !sportType) return 'other'
  return STRAVA_SPORT_MAP[sportType] ?? 'other'
}
