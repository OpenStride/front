/**
 * Canonical sport vocabulary shared across the app.
 *
 * This is the single source of truth every data-provider plugin must map onto:
 * a provider adapter translates its own nomenclature (e.g. Garmin "TRAIL_RUNNING",
 * Strava "TrailRun") into one of these slugs. Each slug has a matching i18n key
 * under `sports.<slug>` in every locale (enforced by tests/unit/sportTypes.spec.ts).
 *
 * Declared as a const array so it is usable both as a type (`SportType`) and at
 * runtime (iteration, validation).
 */
export const SPORT_TYPES = [
  // Running
  'running',
  'treadmill_running',
  'trail_running',
  // Cycling
  'cycling',
  'cyclocross',
  'mountain_biking',
  'e_biking',
  'indoor_cycling',
  // Gym & fitness
  'fitness',
  'fitness_equipment',
  'indoor_climbing',
  'elliptical',
  'cardio_training',
  'rowing_machine',
  'stretching',
  'pilates',
  'stair_climbing',
  'strength_training',
  'yoga',
  // Swimming
  'swimming',
  'pool_swimming',
  'open_water_swimming',
  // Walking & hiking
  'walking',
  'hiking',
  // Winter
  'winter_sports',
  'snowboarding',
  'backcountry_skiing',
  'cross_country_skiing',
  'alpine_skiing',
  'skiing',
  'ice_skating',
  'snowshoeing',
  'snowmobiling',
  // Water
  'water_sports',
  'boating',
  'fishing',
  'kayaking',
  'canoeing',
  'canoeing_kayaking',
  'kitesurfing',
  'sailing',
  'paddling',
  'rowing',
  'diving',
  'stand_up_paddleboarding',
  'surfing',
  'wakeboarding',
  'water_skiing',
  'windsurfing',
  // Multisport
  'transition',
  // Team sports
  'team_sports',
  'american_football',
  'baseball',
  'basketball',
  'cricket',
  'hockey',
  'lacrosse',
  'rugby',
  'soccer',
  'disc_sports',
  'volleyball',
  // Racket sports
  'racket_sports',
  'badminton',
  'padel',
  'pickleball',
  'racquetball',
  'squash',
  'table_tennis',
  'tennis',
  // Other
  'boxing',
  'dance',
  'golf',
  'inline_skating',
  'martial_arts',
  'mountaineering',
  'rock_climbing',
  'para_sports',
  'skateboarding',
  'wheelchair',
  'other'
] as const

export type SportType = (typeof SPORT_TYPES)[number]

const SPORT_TYPE_SET: ReadonlySet<string> = new Set(SPORT_TYPES)

/** Type guard: is the given string a canonical SportType? */
export function isSportType(value: string): value is SportType {
  return SPORT_TYPE_SET.has(value)
}
