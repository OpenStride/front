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

/**
 * Presentation families.
 *
 * ~90 slugs collapse into a handful of groups that are *displayed* the same way.
 * This is not a taxonomy of sports — it only answers "how do we show this?", so
 * anything without distance or duration semantics lands in `other`.
 */
export const SPORT_FAMILIES = [
  'running',
  'cycling',
  'swimming',
  'walking',
  'winter',
  'water',
  'gym',
  'other'
] as const

export type SportFamily = (typeof SPORT_FAMILIES)[number]

export const SPORT_FAMILY: Record<SportType, SportFamily> = {
  // Running
  running: 'running',
  treadmill_running: 'running',
  trail_running: 'running',
  // Cycling
  cycling: 'cycling',
  cyclocross: 'cycling',
  mountain_biking: 'cycling',
  e_biking: 'cycling',
  indoor_cycling: 'cycling',
  // Gym & fitness
  fitness: 'gym',
  fitness_equipment: 'gym',
  indoor_climbing: 'gym',
  elliptical: 'gym',
  cardio_training: 'gym',
  rowing_machine: 'gym',
  stretching: 'gym',
  pilates: 'gym',
  stair_climbing: 'gym',
  strength_training: 'gym',
  yoga: 'gym',
  // Swimming
  swimming: 'swimming',
  pool_swimming: 'swimming',
  open_water_swimming: 'swimming',
  // Walking & hiking
  walking: 'walking',
  hiking: 'walking',
  // Winter
  winter_sports: 'winter',
  snowboarding: 'winter',
  backcountry_skiing: 'winter',
  cross_country_skiing: 'winter',
  alpine_skiing: 'winter',
  skiing: 'winter',
  ice_skating: 'winter',
  snowshoeing: 'walking',
  snowmobiling: 'winter',
  // Water
  water_sports: 'water',
  boating: 'water',
  fishing: 'other',
  kayaking: 'water',
  canoeing: 'water',
  canoeing_kayaking: 'water',
  kitesurfing: 'water',
  sailing: 'water',
  paddling: 'water',
  rowing: 'water',
  diving: 'water',
  stand_up_paddleboarding: 'water',
  surfing: 'water',
  wakeboarding: 'water',
  water_skiing: 'water',
  windsurfing: 'water',
  // Multisport
  transition: 'other',
  // Team sports
  team_sports: 'other',
  american_football: 'other',
  baseball: 'other',
  basketball: 'other',
  cricket: 'other',
  hockey: 'other',
  lacrosse: 'other',
  rugby: 'other',
  soccer: 'other',
  disc_sports: 'other',
  volleyball: 'other',
  // Racket sports
  racket_sports: 'other',
  badminton: 'other',
  padel: 'other',
  pickleball: 'other',
  racquetball: 'other',
  squash: 'other',
  table_tennis: 'other',
  tennis: 'other',
  // Other
  boxing: 'other',
  dance: 'other',
  golf: 'other',
  inline_skating: 'cycling',
  martial_arts: 'other',
  mountaineering: 'walking',
  rock_climbing: 'other',
  para_sports: 'other',
  skateboarding: 'other',
  wheelchair: 'cycling',
  other: 'other'
}

/**
 * How a sport's numbers should be presented.
 *
 * Deliberately narrow. This describes only what the data itself cannot say:
 * which quantity to headline and at what scale distances read. It carries no
 * unit — that is the user's preference (see `useUnits`), and mixing the two
 * would tie sport presentation to an unrelated choice.
 */
export interface SportProfile {
  /** The card's accent metric. `none` for sports where speed is meaningless. */
  primaryMetric: 'pace' | 'pace100' | 'speed' | 'none'
  /** `short` reads in metres/yards — a 1500 m swim is not "1.50 km". */
  distanceScale: 'long' | 'short'
}

const FAMILY_PROFILES: Record<SportFamily, SportProfile> = {
  running: { primaryMetric: 'pace', distanceScale: 'long' },
  cycling: { primaryMetric: 'speed', distanceScale: 'long' },
  swimming: { primaryMetric: 'pace100', distanceScale: 'short' },
  walking: { primaryMetric: 'pace', distanceScale: 'long' },
  winter: { primaryMetric: 'speed', distanceScale: 'long' },
  water: { primaryMetric: 'speed', distanceScale: 'long' },
  gym: { primaryMetric: 'none', distanceScale: 'long' },
  other: { primaryMetric: 'none', distanceScale: 'long' }
}

/**
 * Per-slug overrides, for the cases where a family is not homogeneous.
 * Kept intentionally short: every entry here is a rule someone must maintain.
 */
const SPORT_OVERRIDES: Partial<Record<SportType, Partial<SportProfile>>> = {
  // Open water is swum over a real course, so it reads like a distance event
  // while still being paced per 100 m.
  open_water_swimming: { distanceScale: 'long' },
  // Rowing and paddling crews talk in pace over 500 m, closer to running than
  // to a boat's cruising speed.
  rowing: { primaryMetric: 'pace' },
  rowing_machine: { primaryMetric: 'pace' }
}

/** Presentation profile for a sport slug. Unknown slugs fall back to `other`. */
export function getSportProfile(sport: string): SportProfile {
  // Normalised like every other sport lookup in the app (labels, icons, stats):
  // activities predating the canonical vocabulary carry raw provider strings
  // such as "RUNNING", and an exact match would drop them to `other` — losing
  // the pace the card used to show.
  const slug = (sport ?? '').trim().toLowerCase() as SportType
  const family = SPORT_FAMILY[slug] ?? 'other'
  return { ...FAMILY_PROFILES[family], ...SPORT_OVERRIDES[slug] }
}
